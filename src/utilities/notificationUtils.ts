// Simple notification utility
export default function useNotification() {
  return {
    showSuccess: (message: string) => {
      console.log('[Success]', message);
      // You can add toast notifications here if needed
    },
    showError: (message: string) => {
      console.error('[Error]', message);
      alert(message); // Simple alert for now
    },
    showInfo: (message: string) => {
      console.log('[Info]', message);
    },
  };
}
