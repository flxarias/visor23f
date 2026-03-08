$Port = 8080
$RootFolder = $PWD.Path

Write-Host "Iniciando servidor local en http://localhost:$Port/"
Write-Host "Presiona Ctrl+C para detener el servidor."

$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add("http://localhost:$Port/")
$Listener.Start()

while ($Listener.IsListening) {
    $Context = $Listener.GetContext()
    $Response = $Context.Response
    
    $RequestPath = $Context.Request.Url.LocalPath
    if ($RequestPath -eq "/") {
        $RequestPath = "/index.html"
    }
    
    # decode uri in case of spaces
    $RequestPath = [uri]::UnescapeDataString($RequestPath)
    
    $FilePath = Join-Path -Path $RootFolder -ChildPath $RequestPath.TrimStart('/')
    
    if (Test-Path -Path $FilePath -PathType Leaf) {
        $Ext = [System.IO.Path]::GetExtension($FilePath).ToLower()
        switch ($Ext) {
            ".html" { $Response.ContentType = "text/html; charset=utf-8" }
            ".css"  { $Response.ContentType = "text/css" }
            ".js"   { $Response.ContentType = "application/javascript" }
            ".jpg"  { $Response.ContentType = "image/jpeg" }
            ".jpeg" { $Response.ContentType = "image/jpeg" }
            ".pdf"  { $Response.ContentType = "application/pdf" }
            default { $Response.ContentType = "application/octet-stream" }
        }
        
        try {
            # Use raw bytes and avoid loading entire file to memory if possible
            $Stream = [System.IO.File]::OpenRead($FilePath)
            $Response.ContentLength64 = $Stream.Length
            $Stream.CopyTo($Response.OutputStream)
            $Stream.Close()
            $Response.StatusCode = 200
        } catch {
            $Response.StatusCode = 500
        }
    } else {
        $Response.StatusCode = 404
        Write-Host "404 Not Found: $FilePath"
    }
    
    $Response.Close()
}
