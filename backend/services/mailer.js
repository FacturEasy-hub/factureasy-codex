const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.brevo.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.MAIL_FROM || 'FacturEasy <contact@factureasy.fr>';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Templates ────────────────────────────────────────────────────────────────

function tplFactureEmise({ numero, client_nom, montant_ttc, date }) {
  numero = escapeHtml(numero);
  client_nom = escapeHtml(client_nom);
  return {
    subject: `✓ Facture ${numero} émise via Chorus Pro`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <div style="background:#185FA5;padding:24px 28px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">FacturEasy</h1>
        </div>
        <div style="background:#fff;border:1px solid #E5E7EB;border-top:none;padding:28px;border-radius:0 0 8px 8px">
          <h2 style="font-size:17px;margin:0 0 16px">Votre facture a bien été émise</h2>
          <table style="width:100%;font-size:14px;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#6B7280;border-bottom:1px solid #F3F4F6">Numéro</td><td style="padding:8px 0;font-weight:600;border-bottom:1px solid #F3F4F6">${numero}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;border-bottom:1px solid #F3F4F6">Client</td><td style="padding:8px 0;border-bottom:1px solid #F3F4F6">${client_nom}</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280;border-bottom:1px solid #F3F4F6">Montant TTC</td><td style="padding:8px 0;font-weight:600;color:#185FA5;border-bottom:1px solid #F3F4F6">${Number(montant_ttc).toLocaleString('fr-FR')}€</td></tr>
            <tr><td style="padding:8px 0;color:#6B7280">Date</td><td style="padding:8px 0">${new Date(date).toLocaleDateString('fr-FR')}</td></tr>
          </table>
          <p style="font-size:13px;color:#6B7280;margin-top:20px">La facture est désormais visible dans votre espace Chorus Pro. Le délai légal de paiement est de 30 jours.</p>
          <p style="font-size:13px;color:#9CA3AF;margin-top:24px">FacturEasy · <a href="mailto:support@factureasy.fr" style="color:#185FA5">support@factureasy.fr</a></p>
        </div>
      </div>`
  };
}

function tplFactureAcceptee({ numero, client_nom, montant_ttc }) {
  numero = escapeHtml(numero);
  client_nom = escapeHtml(client_nom);
  return {
    subject: `🎉 Facture ${numero} acceptée — paiement en cours`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <div style="background:#3B6D11;padding:24px 28px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">FacturEasy</h1>
        </div>
        <div style="background:#fff;border:1px solid #E5E7EB;border-top:none;padding:28px;border-radius:0 0 8px 8px">
          <h2 style="font-size:17px;margin:0 0 8px;color:#3B6D11">Bonne nouvelle !</h2>
          <p style="font-size:15px;margin:0 0 16px">La facture <strong>${numero}</strong> pour <strong>${client_nom}</strong> a été acceptée par votre client. Le paiement de <strong>${Number(montant_ttc).toLocaleString('fr-FR')}€ TTC</strong> devrait intervenir dans les 30 jours.</p>
          <p style="font-size:13px;color:#9CA3AF;margin-top:24px">FacturEasy · <a href="mailto:support@factureasy.fr" style="color:#185FA5">support@factureasy.fr</a></p>
        </div>
      </div>`
  };
}

function tplFactureRejetee({ numero, client_nom, motif }) {
  numero = escapeHtml(numero);
  client_nom = escapeHtml(client_nom);
  motif = escapeHtml(motif);
  return {
    subject: `⚠ Facture ${numero} rejetée — action requise`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <div style="background:#A32D2D;padding:24px 28px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">FacturEasy</h1>
        </div>
        <div style="background:#fff;border:1px solid #E5E7EB;border-top:none;padding:28px;border-radius:0 0 8px 8px">
          <h2 style="font-size:17px;margin:0 0 8px;color:#A32D2D">Facture rejetée</h2>
          <p style="font-size:15px;margin:0 0 12px">La facture <strong>${numero}</strong> adressée à <strong>${client_nom}</strong> a été rejetée par Chorus Pro.</p>
          ${motif ? `<div style="background:#FEF2F2;border-left:4px solid #A32D2D;padding:12px 14px;border-radius:4px;font-size:13px;margin-bottom:16px"><strong>Motif :</strong> ${motif}</div>` : ''}
          <p style="font-size:13px;color:#6B7280">Connectez-vous à votre espace FacturEasy pour corriger et réémettre la facture. La correction prend généralement moins de 5 minutes.</p>
          <p style="font-size:13px;color:#9CA3AF;margin-top:24px">FacturEasy · <a href="mailto:support@factureasy.fr" style="color:#185FA5">support@factureasy.fr</a></p>
        </div>
      </div>`
  };
}

function tplBienvenue({ nom, siret }) {
  nom = escapeHtml(nom);
  siret = escapeHtml(siret);
  return {
    subject: 'Bienvenue sur FacturEasy 👋',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <div style="background:#185FA5;padding:24px 28px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">FacturEasy</h1>
        </div>
        <div style="background:#fff;border:1px solid #E5E7EB;border-top:none;padding:28px;border-radius:0 0 8px 8px">
          <h2 style="font-size:17px;margin:0 0 12px">Bienvenue, ${nom} !</h2>
          <p style="font-size:15px;margin:0 0 16px">Votre compte FacturEasy est activé pour le SIRET <strong>${siret}</strong>. Vous pouvez dès maintenant émettre vos premières factures électroniques via Chorus Pro.</p>
          <div style="background:#EAF3DE;border-left:4px solid #3B6D11;padding:12px 14px;border-radius:4px;font-size:13px;margin-bottom:16px">
            <strong>Prochaine étape :</strong> configurez votre profil entreprise et émettez votre première facture test.
          </div>
          <p style="font-size:13px;color:#6B7280">Une question ? Répondez à cet email, on est là.</p>
          <p style="font-size:13px;color:#9CA3AF;margin-top:24px">FacturEasy · <a href="mailto:support@factureasy.fr" style="color:#185FA5">support@factureasy.fr</a></p>
        </div>
      </div>`
  };
}

function tplOtp({ code }) {
  code = escapeHtml(code);
  return {
    subject: 'Code de connexion FacturEasy',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
        <div style="background:#185FA5;padding:24px 28px;border-radius:8px 8px 0 0">
          <h1 style="color:#fff;margin:0;font-size:20px">FacturEasy</h1>
        </div>
        <div style="background:#fff;border:1px solid #E5E7EB;border-top:none;padding:28px;border-radius:0 0 8px 8px">
          <h2 style="font-size:17px;margin:0 0 12px">Votre code de connexion</h2>
          <div style="font-size:28px;letter-spacing:6px;font-weight:800;color:#185FA5;background:#F1F5F9;border-radius:8px;padding:14px 18px;text-align:center">${code}</div>
          <p style="font-size:13px;color:#6B7280;margin-top:16px">Ce code expire dans 10 minutes. Ignorez cet email si vous n'êtes pas à l'origine de la demande.</p>
        </div>
      </div>`
  };
}

// ─── Fonction d'envoi générique ───────────────────────────────────────────────

async function sendMail(to, { subject, html }) {
  if (!process.env.SMTP_USER) {
    console.log(`[MAILER MOCK] To: ${to} | Subject: ${subject}`);
    return;
  }
  await transporter.sendMail({ from: FROM, to, subject, html });
}

// ─── API publique ─────────────────────────────────────────────────────────────

module.exports = {
  sendFactureEmise:   (to, data) => sendMail(to, tplFactureEmise(data)),
  sendFactureAcceptee:(to, data) => sendMail(to, tplFactureAcceptee(data)),
  sendFactureRejetee: (to, data) => sendMail(to, tplFactureRejetee(data)),
  sendBienvenue:      (to, data) => sendMail(to, tplBienvenue(data)),
  sendOtp:            (to, data) => sendMail(to, tplOtp(data)),
};
