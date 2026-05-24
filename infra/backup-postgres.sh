#!/bin/bash
# FacturEasy — Script de backup PostgreSQL automatique
# Usage : ./backup-postgres.sh
# Cron recommandé : 0 2 * * * /path/to/backup-postgres.sh (chaque nuit à 2h)
#
# Variables d'environnement requises :
#   DATABASE_URL        — URL PostgreSQL complète
#   GPG_PASSPHRASE      — passphrase pour le chiffrement symétrique GPG
#   ALERT_WEBHOOK_URL   — URL webhook (Slack/Discord) pour les alertes d'échec (optionnel)
#   RCLONE_REMOTE       — nom du remote rclone (ex: "s3:factureasy-backups") (optionnel)

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────
DB_URL="${DATABASE_URL:?Variable DATABASE_URL manquante}"
GPG_PASSPHRASE="${GPG_PASSPHRASE:-}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/factureasy}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME_GZ="factureasy_${TIMESTAMP}.sql.gz"
FILENAME_ENC="factureasy_${TIMESTAMP}.sql.gz.gpg"
LOG_FILE="${BACKUP_DIR}/backup.log"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"

# ─── Initialisation ───────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"

log()   { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
error() { log "ERREUR : $*"; }

# Alerte webhook en cas d'échec
alert_failure() {
  local msg="$1"
  error "$msg"
  if [[ -n "$ALERT_WEBHOOK_URL" ]]; then
    curl -s -X POST "$ALERT_WEBHOOK_URL" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"🔴 FacturEasy backup ÉCHEC sur $(hostname) : ${msg}\"}" \
      || true
  fi
}

# Handler d'erreur global
trap 'alert_failure "Le script a échoué à la ligne $LINENO (code $?)"' ERR

log "Démarrage du backup — ${FILENAME_GZ}"

# ─── Dump compressé ───────────────────────────────────────────────────────────
pg_dump "$DB_URL" \
  --format=plain \
  --no-password \
  2>>"$LOG_FILE" \
  | gzip > "${BACKUP_DIR}/${FILENAME_GZ}"

SIZE_GZ=$(du -sh "${BACKUP_DIR}/${FILENAME_GZ}" | cut -f1)
log "Dump compressé terminé — taille : ${SIZE_GZ}"

# ─── Vérification d'intégrité du dump ────────────────────────────────────────
if ! gzip -t "${BACKUP_DIR}/${FILENAME_GZ}" 2>/dev/null; then
  alert_failure "fichier de backup corrompu — ${FILENAME_GZ}"
  rm -f "${BACKUP_DIR}/${FILENAME_GZ}"
  exit 1
fi
log "Intégrité gzip : OK"

# ─── Chiffrement GPG (symétrique) ────────────────────────────────────────────
if [[ -n "$GPG_PASSPHRASE" ]]; then
  echo "$GPG_PASSPHRASE" | gpg --batch --yes --passphrase-fd 0 \
    --symmetric --cipher-algo AES256 \
    --output "${BACKUP_DIR}/${FILENAME_ENC}" \
    "${BACKUP_DIR}/${FILENAME_GZ}"
  # Supprimer le fichier non chiffré
  rm -f "${BACKUP_DIR}/${FILENAME_GZ}"
  FINAL_FILE="${BACKUP_DIR}/${FILENAME_ENC}"
  SIZE=$(du -sh "$FINAL_FILE" | cut -f1)
  log "Chiffrement GPG AES-256 appliqué — taille finale : ${SIZE}"
else
  log "AVERTISSEMENT : GPG_PASSPHRASE non défini, backup non chiffré"
  FINAL_FILE="${BACKUP_DIR}/${FILENAME_GZ}"
  SIZE="$SIZE_GZ"
fi

# ─── Copie vers stockage externe (rclone) ─────────────────────────────────────
if [[ -n "$RCLONE_REMOTE" ]] && command -v rclone &>/dev/null; then
  log "Envoi vers stockage externe : ${RCLONE_REMOTE}..."
  rclone copy "$FINAL_FILE" "$RCLONE_REMOTE" --log-level INFO 2>>"$LOG_FILE"
  log "Copie externe réussie"
else
  log "AVERTISSEMENT : RCLONE_REMOTE non configuré ou rclone absent — backup local uniquement"
fi

# ─── Nettoyage des anciens backups locaux ─────────────────────────────────────
DELETED=$(find "$BACKUP_DIR" -name "factureasy_*.sql.gz*" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
log "Fichiers locaux supprimés (>${RETENTION_DAYS}j) : ${DELETED}"

# ─── Rapport final ────────────────────────────────────────────────────────────
TOTAL=$(find "$BACKUP_DIR" -name "factureasy_*.sql.gz*" | wc -l)
log "Total backups locaux conservés : ${TOTAL} | Dernier : $(basename "$FINAL_FILE") (${SIZE})"
log "✅ Backup terminé avec succès."

# Notification succès (optionnel)
if [[ -n "$ALERT_WEBHOOK_URL" ]]; then
  curl -s -X POST "$ALERT_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"✅ FacturEasy backup OK — $(basename "$FINAL_FILE") (${SIZE})\"}" \
    || true
fi
