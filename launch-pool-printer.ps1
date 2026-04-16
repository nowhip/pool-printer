param(
  [string]$BaseUrl = "http://localhost:3000/public"
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

function Get-PublicUrlWithUser {
  param(
    [string]$Url,
    [string]$User
  )

  $builder = [System.UriBuilder]::new($Url)
  $builder.Query = "user=$([uri]::EscapeDataString($User))"
  return $builder.Uri.AbsoluteUri
}

$userName = Get-NormalizedWindowsUser
$targetUrl = Get-PublicUrlWithUser -Url $BaseUrl -User $userName

Start-Process $targetUrl
