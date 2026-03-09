export function formatActivityDetails(type: string, description: string): string {
  if (type !== 'system' && type !== 'login') return description;

  try {
    // Audit logs usually store JSON in description (from our API transformation) or details
    const details = JSON.parse(description);
    
    // Format based on known keys/patterns
    if (details.ip && details.reason === "Admin impersonation") {
        return `Вход администратора (IP: ${details.ip})`;
    }
    
    if (details.targetRole && details.targetEmail) {
        return `Вход под пользователем ${details.targetEmail} (${translateRole(details.targetRole)})`;
    }
    
    // User updates
    if (details.email || details.role || details.isBlocked !== undefined || details.passwordChanged) {
        const updates = [];
        if (details.email) updates.push(`Email изменен`);
        if (details.role) updates.push(`Роль изменена на ${translateRole(details.role)}`);
        if (details.isBlocked !== undefined) updates.push(details.isBlocked ? "Приостановлен доступ" : "Восстановлен доступ");
        if (details.frozenUntil !== undefined) updates.push(details.frozenUntil ? "Доступ заморожен" : "Доступ разморожен");
        if (details.passwordChanged) updates.push("Пароль изменен");
        
        return updates.join(", ") || "Обновление профиля";
    }

    // New user created by admin
    if (details.createdEmail && details.createdRole) {
        return `Создан аккаунт (${details.createdEmail}) с ролью ${translateRole(details.createdRole)}`;
    }

    // Fallback for IP only (simple login)
    if (details.ip && Object.keys(details).length === 1) {
        return `Успешный вход (IP: ${details.ip})`;
    }

    // Default: return pretty JSON or simplified text
    return JSON.stringify(details, null, 2);
  } catch (e) {
    // Not JSON, return as is
    return description;
  }
}

function translateRole(role: string): string {
  switch (role) {
    case "admin": return "Администратор";
    case "student": return "Студент";
    case "curator": return "Куратор";
    default: return role;
  }
}
