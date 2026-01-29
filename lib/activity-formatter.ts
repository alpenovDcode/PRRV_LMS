export function formatActivityDetails(type: string, description: string): string {
  if (type !== 'system' && type !== 'login') return description;

  try {
    // Audit logs usually store JSON in description (from our API transformation) or details
    // The API route currently does `JSON.stringify(log.details)` into description
    const details = JSON.parse(description);
    
    // Format based on known keys/patterns
    if (details.ip && details.reason === "Admin impersonation") {
        return `Вход администратора (IP: ${details.ip})`;
    }
    
    if (details.targetRole && details.targetEmail) {
        return `Вход под пользователем ${details.targetEmail} (${details.targetRole})`;
    }
    
    // User updates
    if (details.email || details.role || details.isBlocked !== undefined) {
        const updates = [];
        if (details.email) updates.push(`Email изменен`);
        if (details.role) updates.push(`Роль изменена на ${details.role}`);
        if (details.isBlocked !== undefined) updates.push(details.isBlocked ? "Заблокирован" : "Разблокирован");
        if (details.frozenUntil !== undefined) updates.push(details.frozenUntil ? "Заморожен" : "Разморожен");
        if (details.passwordChanged) updates.push("Пароль изменен");
        
        return updates.join(", ") || "Обновление профиля";
    }

    // Fallback for IP only (simple login)
    if (details.ip && Object.keys(details).length === 1) {
        return `IP: ${details.ip}`;
    }

    // Default: return pretty JSON or simplified text
    return JSON.stringify(details, null, 2);
  } catch (e) {
    // Not JSON, return as is
    return description;
  }
}
