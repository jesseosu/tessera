import { useEffect, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; type: ToastType };

let toastId = 0;
let addToastFn: ((msg: string, type: ToastType) => void) | null = null;

export function showToast(message: string, type: ToastType = 'info') {
  addToastFn?.(message, type);
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    addToastFn = (message, type) => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3000);
    };
    return () => { addToastFn = null; };
  }, []);

  return (
    <>
      {toasts.map((t, i) => (
        <div
          key={t.id}
          className={`toast ${t.type}`}
          style={{ bottom: 24 + i * 56 }}
        >
          {t.message}
        </div>
      ))}
    </>
  );
}
