export const defaultEmailTemplates = [
  {
    event: "USER_CREATED_BY_ADMIN",
    name: "Создание пользователя администратором",
    subject: "Добро пожаловать в Прорыв!",
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Добро пожаловать в Прорыв!</h2>
        <p>Ваш аккаунт создан.</p>
        <p>Ваши данные для входа:</p>
        <ul>
          <li>Email: <strong>{{email}}</strong></li>
          <li>Пароль: <strong>{{password}}</strong></li>
        </ul>
        <p>
          <a href="{{loginUrl}}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Войти в кабинет
          </a>
        </p>
      </div>
    `,
    variables: {
      fullName: "Имя пользователя",
      email: "Email пользователя",
      password: "Пароль (только при создании)",
      loginUrl: "Ссылка на вход"
    }
  },
  {
    event: "COURSE_ACCESS_GRANTED",
    name: "Выдача доступа к курсу",
    subject: "Вам открыт доступ к курсу {{courseName}}",
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Доступ к курсу открыт!</h2>
        <p>Здравствуйте, {{fullName}}!</p>
        <p>Вам предоставлен доступ к курсу <strong>{{courseName}}</strong>.</p>
        <p>Вы можете начать обучение прямо сейчас:</p>
        <p>
          <a href="{{courseUrl}}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            Перейти к курсу
          </a>
        </p>
      </div>
    `,
    variables: {
      fullName: "Имя пользователя",
      courseName: "Название курса",
      courseUrl: "Ссылка на курс"
    }
  }
];
