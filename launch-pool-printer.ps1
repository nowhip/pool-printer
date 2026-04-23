param(
  [string]$AppBaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"

function Get-NormalizedWindowsUser {
  $identityName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

  if ([string]::IsNullOrWhiteSpace($identityName)) {
    $identityName = $env:USERNAME
  }

  if ([string]::IsNullOrWhiteSpace($identityName)) {
    throw "Could not resolve the current Windows user."
  }

  $user = $identityName.Trim()

  if ($user.Contains("\\")) {
    $user = $user.Split("\\")[-1]
  }

  if ($user.Contains("@")) {
    $user = $user.Split("@")[0]
  }

  $user = $user.Trim().ToLowerInvariant()

  if ([string]::IsNullOrWhiteSpace($user)) {
    throw "Could not normalize the current Windows user."
  }

  return $user
}

function Get-LaunchUrl {
  param(
    [string]$BaseUrl,
    [string]$UserName
  )

  $uri = [System.Uri]::new($BaseUrl)
  $launchEndpoint = "$($uri.Scheme)://$($uri.Authority)/api/public/launch"

  $payload = @{
    username = $UserName
  } | ConvertTo-Json

  $response = Invoke-RestMethod -Method Post -Uri $launchEndpoint -ContentType "application/json" -Body $payload

  if (-not $response.launchUrl) {
    throw "Launch endpoint did not return launchUrl."
  }

  return [string]$response.launchUrl
}

$userName = Get-NormalizedWindowsUser
$launchUrl = Get-LaunchUrl -BaseUrl $AppBaseUrl -UserName $userName

Start-Process $launchUrl
