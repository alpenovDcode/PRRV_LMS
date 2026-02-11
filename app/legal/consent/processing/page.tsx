import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Согласие на обработку данных | ООО “МАСТЕРСКАЯ ЗНАНИЙ”",
  description: "Согласие на обработку персональных данных на сайте в Интернете",
};

export default function ProcessingConsentPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl text-center">
          Согласие на обработку персональных данных на сайте в Интернете
        </CardTitle>
      </CardHeader>
      <CardContent className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-black prose-p:text-black prose-strong:text-black prose-li:text-black prose-a:text-blue-600 text-black">
        
        <div className="mb-8 p-4 border rounded-md bg-gray-50 dark:bg-slate-900">
          <p className="m-0"><strong>Оператор:</strong> Общество с ограниченной ответственностью “МАСТЕРСКАЯ ЗНАНИЙ”</p>
          <p className="m-0"><strong>ОГРН:</strong> 1257700218071, <strong>ИНН:</strong> 9714075294, <strong>КПП:</strong> 771401001</p>
          <p className="m-0"><strong>Адрес:</strong> 125167, Г.МОСКВА, ВН.ТЕР.Г. МУНИЦИПАЛЬНЫЙ ОКРУГ АЭРОПОРТ, ПР-КТ ЛЕНИНГРАДСКИЙ, Д. 36, СТР. 39, ПОМЕЩ. 4</p>
          <p className="m-0"><strong>E-mail:</strong> <a href="mailto:hello@prrv.tech">hello@prrv.tech</a></p>
          <p className="m-0"><strong>Сайт:</strong> <a href="https://prrv.tech/" target="_blank" rel="noopener noreferrer">https://prrv.tech/</a></p>
        </div>

        <p>
          Настоящим принимаю решение о предоставлении моих персональных данных и даю Оператору – Обществу с ограниченной ответственностью “МАСТЕРСКАЯ ЗНАНИЙ” (ОГРН: 1257700218071), в соответствии со статьей 9 Федерального закона от 27.07.2006 № 152-ФЗ “О персональных данных”, в целях, установленных Политикой конфиденциальности Оператора, согласие на обработку следующих персональных данных:
        </p>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-300 my-4">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2">Цели</th>
                <th className="border border-gray-300 p-2">Категории субъектов / Перечень данных</th>
                <th className="border border-gray-300 p-2">Способы, сроки и уничтожение</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-2 text-xs">Подготовка, заключение и исполнение гражданско-правового договора</td>
                <td className="border border-gray-300 p-2 text-xs">
                  Контрагенты, Клиенты. <br/>
                  <strong>Данные:</strong> ФИО, email, номер телефона (Общие категории).
                </td>
                <td className="border border-gray-300 p-2 text-xs" rowSpan={2}>
                  <strong>Способы:</strong> автоматизированная, с передачей по сети Интернет. <br/>
                  <strong>Срок:</strong> До достижения целей, истечения срока согласия или его отзыва. <br/>
                  <strong>Уничтожение:</strong> согласно п. 4.2.8. Политики.
                </td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 text-xs">Осуществление рекламной деятельности</td>
                <td className="border border-gray-300 p-2 text-xs">
                  Посетители сайта, Клиенты. <br/>
                  <strong>Данные:</strong> ФИО, email, номер телефона (Общие категории).
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>
          Обработка осуществляется следующими способами: сбор, запись, систематизация, накопление, хранение, уточнение (обновление, изменение), извлечение, использование, передача (распространение, предоставление, доступ), обезличивание, блокирование, удаление, уничтожение персональных данных, в том числе в информационных системах персональных данных с использованием средств автоматизации или без использования таких средств.
        </p>

        <p>
          Я соглашаюсь с тем, что на сайте происходит сбор и обработка обезличенных данных о посетителях (в т.ч. файлов “cookies”) с помощью сервисов интернет-статистики (Яндекс Метрика и других), а также информация о браузере, времени доступа, информация об устройстве, реферер (адрес предыдущей страницы).
        </p>

        <p>
          Согласие на обработку персональных данных является конкретным, предметным, информированным, сознательным и однозначным.
        </p>

        <p>
          Я соглашаюсь с тем, что считаюсь давшим (-ей) согласие на обработку своих персональных данных, внесенных в поля формы, в момент проставления символа в чек-боксе на Сайте рядом с текстом вида: <strong>“Я даю согласие на обработку моих персональных данных в соответствии с условиями политики конфиденциальности”</strong>.
        </p>

        <p>
          Я принимаю условия <a href="https://prrv.tech/" target="_blank" rel="noopener noreferrer">Политики конфиденциальности Оператора</a> и подтверждаю, что ознакомлен(а) с ней на момент предоставления настоящего Согласия.
        </p>

        <p>
          Все данные обрабатываются до завершения взаимодействия по запросу или до получения отзыва согласия и уничтожаются по истечении 30 дней в соответствии с ч. 4 - 5 ст. 21 152-ФЗ.
        </p>

        <p className="italic">
          Согласие может быть отозвано путем направления письменного заявления по адресу Оператора или на электронную почту: <a href="mailto:hello@prrv.tech">hello@prrv.tech</a>.
        </p>
      </CardContent>
    </Card>
  );
}