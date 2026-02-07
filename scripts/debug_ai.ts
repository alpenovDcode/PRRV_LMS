
import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

async function gradeHomework(
  submissionContent: string, 
  aiPrompt: string
): Promise<{ 
  status: "approved" | "rejected"; 
  comment: string 
}> {
  try {
    const input = {
      prompt: `
      Ты — строгий, но справедливый куратор образовательных курсов. Твоя задача — проверить домашнее задание студента.
      
      ИНСТРУКЦИЯ К ЗАДАНИЮ (КРИТЕРИИ):
      ${aiPrompt}
      
      ОТВЕТ СТУДЕНТА:
      ${submissionContent}
      
      ТВОЯ ЗАДАЧА:
      1. Проанализируй ответ студента на соответствие инструкции.
      2. Если ответ студента удовлетворяет критериям, верни статус APPROVE.
      3. Если ответ слабый, неполный или не по теме, верни статус REJECT.
      4. Напиши комментарий для студента на русском языке. Если REJECT — объясни, что исправить. Если APPROVE — похвали и подбодри.
      
      ФОРМАТ ОТВЕТА (JSON):
      {
        "status": "APPROVED" или "REJECTED",
        "comment": "Текст комментария..."
      }
      Отвечай ТОЛЬКО валидным JSON.
      `,
      max_tokens: 1000,
      temperature: 0.5
    };

    // Using Llama 3 70B Instruct
    const output = await replicate.run(
      "meta/meta-llama-3-70b-instruct",
      { 
        input: {
          prompt: `
            Ты — строгий, но справедливый куратор образовательных курсов. Твоя задача — проверить домашнее задание студента.
            
            ИНСТРУКЦИЯ К ЗАДАНИЮ (КРИТЕРИИ):
            ${aiPrompt}
            
            ОТВЕТ СТУДЕНТА:
            ${submissionContent}
            
            ТВОЯ ЗАДАЧА:
            1. Проанализируй ответ студента на соответствие инструкции.
            2. Если ответ студента удовлетворяет критериям, верни статус APPROVED.
            3. Если ответ слабый, неполный или не по теме, верни статус REJECTED.
            4. Напиши комментарий для студента на русском языке. Если REJECTED — объясни, что исправить. Если APPROVED — похвали и подбодри.
            
            ФОРМАТ ОТВЕТА (JSON):
            {
              "status": "APPROVED" или "REJECTED",
              "comment": "Текст комментария..."
            }
            Отвечай ТОЛЬКО валидным JSON. Не пиши ничего лишнего.
          `,
          max_tokens: 1000,
          temperature: 0.5
        }
      }
    );

    const resultText = Array.isArray(output) ? output.join("") : String(output);
    console.log("AI Raw Output:", resultText);

    try {
       const jsonMatch = resultText.match(/\{[\s\S]*\}/);
       const jsonStr = jsonMatch ? jsonMatch[0] : resultText;
       const result = JSON.parse(jsonStr);
       
       return {
          status: (result.status === "APPROVED" || result.status === "approved") ? "approved" : "rejected",
          comment: result.comment || "Проверено ИИ"
       };
    } catch (e) {
       console.error("Failed to parse AI response", resultText);
       if (resultText.includes("APPROVED")) {
          return { status: "approved", comment: resultText };
       }
       return { status: "rejected", comment: "Ошибка при автоматической проверке. Пожалуйста, обратитесь к куратору." };
    }

  } catch (error) {
    console.error("Replicate AI error:", error);
    return { status: "rejected", comment: "Техническая ошибка проверки. Попробуйте позже." };
  }
}

async function main() {
  console.log("Starting AI test...");
  
  const prompt = "Оцени ответ студента. Критерий: должен быть ответ на вопрос 'Как дела?'.";
  const content = "У меня все хорошо, спасибо!";
  
  try {
     const start = Date.now();
     const result = await gradeHomework(content, prompt);
     const end = Date.now();
     
     console.log(`AI Finished in ${(end - start)/1000}s`);
     console.log("Result:", JSON.stringify(result, null, 2));
  } catch (e) {
     console.error("Main Crashed:", e);
  }
}

main();
