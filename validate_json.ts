
// Use JSON.parse on a raw double-escaped string to simulate input

const raw = "{\\\"ФИО\\\":\\\"Слабинская Елизавета Вадимовна \\\",\\\"Email\\\":\\\"slabliza@yandex.ru\\\",\\\"Телефон\\\":\\\"89642506627\\\",\\\"_answers\\\":{\\\"648970a0-4126-453f-814c-f8d7acbf20b8\\\":\\\"1) 130.000\\\\n2)108 ч в месяц\\\\n130.000/108=1203 р\\\\n3)1200 р\\\\n4)Боюсь потерять учеников из за повышения стоимости \\\\n5) Финансов не будет хватнна закрытие даже базовых потребностей. Помимо финансов беспокоит неуверенность в завтра, невозможность работать и наслаждаться работой, мысли о смене деятельности ( по специальности я провизор)\\\",\\\"00c40adf-e9d1-40df-be88-46949aaa9350\\\":\\\"300.000\\\\n20 ч в неделю\\\\n3750 р\\\\nПовысить уровень дохода, значит иметь больше свободы для путешествия и собственного интеллектуального развития \\\\nСмогу покорить те места, куда давно хочется и открыть свое ИП. помимо ИП и путешествий, смогу обеспечивать своих родителей, купить квартиру мечты в другом городе, будет уверенность в своем деле \\\",\\\"7ec77d60-213f-43ff-84a4-a39e8ff9c17f\\\":\\\"Свобода \\\"}}";

try {
    const parsed = JSON.parse(raw);
    console.log("Parsed Successfully.");
    console.log("CORRECTED_JSON_START");
    console.log(JSON.stringify(parsed, null, 2));
    console.log("CORRECTED_JSON_END");
} catch (e) {
    console.log("Parse failed:", e.message);
    const cleaned = raw.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    try {
        const cleanedParsed = JSON.parse(cleaned);
        console.log("Cleaned Parse Success.");
        console.log("CORRECTED_JSON_START");
        console.log(JSON.stringify(cleanedParsed, null, 2));
        console.log("CORRECTED_JSON_END");

        console.log("CORRECTED_CONTENT_STRING_START");
        console.log(JSON.stringify(cleanedParsed));
        console.log("CORRECTED_CONTENT_STRING_END");
    } catch (e) {
        console.log("Cleaned parse failed:", e.message);
    }
}
