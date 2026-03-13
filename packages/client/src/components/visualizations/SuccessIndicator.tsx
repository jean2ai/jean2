import { CheckCircle } from 'lucide-react';

interface SuccessIndicatorProps {
  message?: string;
}

export function SuccessIndicator({ message = 'Success' }: SuccessIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-success">
      <CheckCircle className="size-4" />
      <span>{message}</span>
    </div>
  );
}
