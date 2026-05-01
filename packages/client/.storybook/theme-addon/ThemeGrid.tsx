import { THEME_MODES, THEME_SCHEMES } from './constants';

interface ThemeGridProps {
  children: React.ReactNode;
  label: string;
}

export function ThemeGrid({ children, label }: ThemeGridProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{label}</h2>
      <div className="grid grid-cols-5 gap-4">
        {THEME_MODES.map((mode) =>
          THEME_SCHEMES.map((scheme) => (
            <div
              key={`${mode}-${scheme}`}
              className={`${mode} ${scheme} rounded-lg border border-border overflow-hidden`}
            >
              <div className="text-xs px-2 py-1 bg-muted text-muted-foreground border-b border-border">
                {mode} / {scheme}
              </div>
              <div className="bg-background text-foreground p-3">
                {children}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
