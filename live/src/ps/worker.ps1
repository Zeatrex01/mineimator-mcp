# Long-lived helper: compiles win.cs once, then answers one JSON line per request on stdin with one JSON line on stdout.
# Started by src/ps/client.ts; exits when stdin closes. Nothing is installed and no files are written.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$src = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'win.cs'))
Add-Type -TypeDefinition $src -ReferencedAssemblies System.Drawing, System.Web.Extensions
[Console]::Out.WriteLine('{"ready":true}')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  [Console]::Out.WriteLine([Win]::Handle($line))
  [Console]::Out.Flush()
}
