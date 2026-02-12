
const content = "{\"ФИО\":\"Слабинская Елизавета Вадимовна \",\"Email\":\"slabliza@yandex.ru\",\"Телефон\":\"89642506627\",\"_answers\":{\"648970a0-4126-453f-814c-f8d7acbf20b8\":\"1) 130.000\\n2)108 ч в месяц\\n130.000/108=1203 р\\n3)1200 р\\n4)Боюсь потерять учеников из за повышения стоимости \\n5) Финансов не будет хватнна закрытие даже базовых потребностей. Помимо финансов беспокоит неуверенность в завтра, невозможность работать и наслаждаться работой, мысли о смене деятельности ( по специальности я провизор)\",\"00c40adf-e9d1-40df-be88-46949aaa9350\":\"300.000\\n20 ч в неделю\\n3750 р\\nПовысить уровень дохода, значит иметь больше свободы для путешествия и собственного интеллектуального развития \\nСмогу покорить те места, куда давно хочется и открыть свое ИП. помимо ИП и путешествий, смогу обеспечивать своих родителей, купить квартиру мечты в другом городе, будет уверенность в своем деле \",\"7ec77d60-213f-43ff-84a4-a39e8ff9c17f\":\"Свобода \"}}";

function testParsing(input: string) {
    console.log("Original:", input);
    try {
        let contentObj: any = input;
        let attempts = 0;
        while (typeof contentObj === 'string' && attempts < 3) {
            const trimmed = contentObj.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                   console.log(`Attempt ${attempts + 1}: parsing...`);
                   contentObj = JSON.parse(trimmed);
                   console.log(`Parsed type: ${typeof contentObj}`);
                } catch (e) {
                   console.error("Parse error", e);
                   break;
                }
            } else {
                break;
            }
            attempts++;
        }

        if (contentObj && typeof contentObj === 'object' && !Array.isArray(contentObj)) {
            console.log("Outer object parsed successfully.");
            console.log("Keys:", Object.keys(contentObj));
            
            if (contentObj._answers) {
                console.log("_answers type:", typeof contentObj._answers);
                console.log("_answers value:", contentObj._answers);
                
                if (typeof contentObj._answers === 'string') {
                    console.log("Parsing _answers...");
                    try {
                        const answersRaw = contentObj._answers.trim();
                         // The issue might be here if it doesn't look like an object string? 
                         // But in the example it is: "{\"key\":\"val\"}" which is strictly NOT starting with { but "
                         // Wait, no. If contentObj is parsed, _answers should be the value.
                         // In the input string: \"_answers\":{\"key\":\"val\"} -- NO quotes around the value block?
                         // Let's check the input again strictly.
                         
                         if (answersRaw.startsWith('{')) {
                            contentObj._answers = JSON.parse(answersRaw);
                            console.log("_answers parsed successfully");
                         } else {
                            console.log("_answers does not start with {");
                         }
                    } catch (e) { 
                        console.error("_answers parse error", e);
                    }
                }
            }
        } else {
            console.log("Failed to parse into object");
        }
        
    } catch (e) {
        console.error("General error", e);
    }
}

testParsing(content);
