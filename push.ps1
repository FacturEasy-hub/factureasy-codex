Set-Location "C:\Users\benja\OneDrive\Documents\Claude\Projects\FacturEasy (1)"

git add .
git commit -m "Update $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git push

Write-Host ""
Write-Host "Push OK - Render redeploie dans 2 minutes" -ForegroundColor Green
Write-Host ""
Read-Host "Appuie sur Entree pour fermer"
