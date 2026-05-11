import { Toaster as Sonner, type ToasterProps } from "sonner";

import { useTheme } from "@/lib/theme";

export function Toaster(props: ToasterProps) {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      toastOptions={{
        classNames: {
          toast: "bg-background text-foreground border-border shadow-lg",
          description: "text-muted-foreground",
          actionButton: "bg-foreground text-background",
          cancelButton: "bg-muted text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
