import React from 'react';

interface DividerBlockProps {
  content: {
    style?: "line" | "empty";
    spacing: "sm" | "md" | "lg";
  };
  design: {
    bg: string;
    textColor: string;
  };
}

export default function DividerBlock({ content, design }: DividerBlockProps) {
  const spacingMap = {
    sm: "py-4",
    md: "py-10",
    lg: "py-20"
  };

  return (
    <div className={`${design.bg} ${spacingMap[content.spacing] || spacingMap.md}`}>
      <div className="max-w-7xl mx-auto px-4">
        {content.style !== "empty" && (
          <div className="h-[1px] w-full bg-current opacity-10" />
        )}
      </div>
    </div>
  );
}
