import { createFileRoute } from '@tanstack/react-router';
import FirstServerScreen from '@/components/FirstServerScreen';

export const Route = createFileRoute('/add-server')({
  component: FirstServerScreen,
});
