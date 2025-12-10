import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent gradient-primary text-white shadow-sm",
        secondary:
          "border-transparent bg-secondary text-dark hover:bg-primary-100",
        outline: "text-dark border-primary/30 hover:border-primary hover:bg-primary/5",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        accent: "border-transparent gradient-accent text-white shadow-sm",
        warning: "border-transparent gradient-warning text-white shadow-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };


