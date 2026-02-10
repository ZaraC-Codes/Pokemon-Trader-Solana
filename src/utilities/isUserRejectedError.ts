// Check if error is user rejection
export function isUserRejectedError(error: any): boolean {
  if (!error) return false;
  
  const message = error.message?.toLowerCase() || '';
  const code = error.code;
  
  // Common user rejection patterns
  return (
    message.includes('user rejected') ||
    message.includes('user denied') ||
    message.includes('rejected') ||
    code === 4001 || // MetaMask user rejection code
    code === 'ACTION_REJECTED'
  );
}
