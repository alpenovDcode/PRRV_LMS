import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Условия использования | Прорыв.ру",
  description: "Условия использования платформы",
};

export default function TermsPage() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Условия использования</CardTitle>
          <p className="text-sm text-muted-foreground">Последнее обновление: {new Date().toLocaleDateString("ru-RU")}</p>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-black prose-p:text-black prose-strong:text-black prose-li:text-black prose-a:text-blue-600 text-black">
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">1. Принятие условий</h2>
            <p>
              Используя платформу Прорыв.ру, вы соглашаетесь с настоящими Условиями использования.
              Если вы не согласны с этими условиями, пожалуйста, не используйте Платформу.
            </p>
          </section>

          <section className="mt-8 space-y-4">
            <h2 className="text-2xl font-semibold">2. Использование платформы</h2>
            <p>Вы обязуетесь:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Предоставлять достоверную информацию при регистрации</li>
              <li>Не передавать свой аккаунт третьим лицам</li>
              <li>Не использовать платформу в незаконных целях</li>
              <li>Не нарушать права интеллектуальной собственности</li>
              <li>Не пытаться получить несанкционированный доступ к системе</li>
            </ul>
          </section>

          <section className="mt-8 space-y-4">
            <h2 className="text-2xl font-semibold">3. Интеллектуальная собственность</h2>
            <p>
              Весь контент платформы, включая курсы, видео, тексты и другие материалы, защищены
              авторским правом и принадлежат их правообладателям.
            </p>
            <p>
              Вы не имеете права копировать, распространять или использовать контент платформы без
              письменного разрешения.
            </p>
          </section>

          <section className="mt-8 space-y-4">
            <h2 className="text-2xl font-semibold">4. Ограничение ответственности</h2>
            <p>
              Платформа предоставляется «как есть». Мы не гарантируем бесперебойную работу платформы
              и не несем ответственности за возможные сбои.
            </p>
          </section>

          <section className="mt-8 space-y-4">
            <h2 className="text-2xl font-semibold">5. Изменение условий</h2>
            <p>
              Мы оставляем за собой право изменять настоящие Условия использования. Изменения вступают
              в силу с момента публикации на Платформе.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

