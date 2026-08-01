export function isRecoveryMode(location = window.location) {
  return new URL(location.href).searchParams.get('recovery') === '1'
}
