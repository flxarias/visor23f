$SearchDirs = @("JPGs", "PDFs")
$AllowedExtensions = @(".jpg", ".pdf")
$OutputFile = "database.js"

$Files = @()

foreach ($Dir in $SearchDirs) {
    if (Test-Path $Dir) {
        $FoundFiles = Get-ChildItem -Path $Dir -File -Recurse | Where-Object { $AllowedExtensions -contains $_.Extension.ToLower() }
        foreach ($File in $FoundFiles) {
            # Convert to relative path format using forward slashes for web
            $RelativePath = $File.FullName.Replace($PWD.Path + '\', '').Replace('\', '/')
            $Files += "'$RelativePath'"
        }
    }
}

$JsContent = "const documentDatabase = [ " + ($Files -join ", ") + " ];"
Set-Content -Path $OutputFile -Value $JsContent -Encoding UTF8

Write-Host "Created $OutputFile with $($Files.Count) entries."
