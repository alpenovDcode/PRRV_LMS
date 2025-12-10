import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Политика конфиденциальности | Proryv LMS",
  description: "Политика обработки персональных данных",
};

export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Политика конфиденциальности</CardTitle>
          <p className="text-sm text-muted-foreground">Последнее обновление: {new Date().toLocaleDateString("ru-RU")}</p>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none dark:prose-invert">
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">1. Общие положения</h2>
            <p>
              Настоящая Политика конфиденциальности определяет порядок обработки и защиты персональных
              данных пользователей платформы Proryv LMS (далее — «Платформа»).
            </p>
            <p>
              Используя Платформу, вы соглашаетесь с условиями настоящей Политики конфиденциальности.
            </p>
          </section>

          <section className="mt-8 space-y-4">
            <h2 className="text-2xl font-semibold">2. Собираемые данные</h2>
            <p>Мы собираем следующие категории персональных данных:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Идентификационные данные:</strong> имя, email адрес
              </li>
              <li>
                <strong>Данные для авторизации:</strong> пароль (хранится в зашифрованном виде)
              </li>
              <li>
                <strong>Данные об обучении:</strong> прогресс прохождения курсов, выполненные задания,
                результаты тестов
              </li>
              <li>
                <strong>Технические данные:</strong> IP-адрес, тип браузера, информация об устройстве
              </li>
            </ul>
          </section>

          <section className="mt-8 space-y-4">
            <h2 className="text-2xl font-semibold">3. Цели обработки данных</h2>
            <p>Персональные данные обрабатываются в следующих целях:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Предоставление доступа к платформе и курсам</li>
              <li>Отслеживание прогресса обучения</li>
              <li>Отправка уведомлений и важной информации</li>
              <li>Улучшение качества сервиса</li>
              <li>Обеспечение безопасности платформы</li>
            </ul>
          </section>

          <section className="mt-8 space-y-4">
            <h2 className="text-2xl font-semibold">4. Защита данных</h2>
            <p>
              Мы применяем современные методы защиты данных, включая шифрование, безопасное хранение
              паролей и ограничение доступа к персональным данным.
            </p>
            <p>
              Доступ к вашим данным имеют только уполномоченные сотрудники, которым это необходимо для
              выполнения служебных обязанностей.
            </p>
          </section>

          <section className="mt-8 space-y-4">
            <h2 className="text-2xl font-semibold">5. Ваши права</h2>
            <p>Вы имеете право:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Получать информацию о ваших персональных данных</li>
              <li>Требовать исправления неточных данных</li>
              <li>Требовать удаления ваших данных</li>
              <li>Отозвать согласие на обработку данных</li>
            </ul>
          </section>

          <section className="mt-8 space-y-4">
            <h2 className="text-2xl font-semibold">6. Контакты</h2>
            <p>
              По вопросам, связанным с обработкой персональных данных, обращайтесь по email:
              privacy@proryv.ru
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
