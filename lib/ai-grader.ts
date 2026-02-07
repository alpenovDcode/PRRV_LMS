import axios from "axios";

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

async function pollPrediction(predictionId: string): Promise<any> {
    const maxAttempts = 60;
    const delayMs = 2000;

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, delayMs));

        const response = await axios.get(
            `https://api.replicate.com/v1/predictions/${predictionId}`,
            {
                headers: {
                    Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const prediction = response.data;
        if (prediction.status === 'succeeded' || prediction.status === 'failed' || prediction.status === 'canceled') {
            return prediction;
        }
    }
    throw new Error("Prediction timed out");
}

async function runReplicatePrediction(model: string, input: any): Promise<any> {
    if (!REPLICATE_API_TOKEN) {
        throw new Error("REPLICATE_API_TOKEN is not set");
    }

    const response = await axios.post(
        `https://api.replicate.com/v1/models/${model}/predictions`,
        {
            input: input,
        },
        {
            headers: {
                Authorization: `Bearer ${REPLICATE_API_TOKEN}`,
                'Content-Type': 'application/json',
                'Prefer': 'wait',
            },
        }
    );

    let prediction = response.data;

    if (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled') {
        prediction = await pollPrediction(prediction.id);
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
        throw new Error(`Replicate prediction failed: ${prediction.error}`);
    }

    return prediction;
}

export async function gradeHomework(
  submissionContent: string, 
  aiPrompt: string
): Promise<{ 
  status: "approved" | "rejected"; 
  comment: string 
}> {
  try {
    const prompt = `
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
    `;

    // Using Anthropic Claude 3.5 Sonnet
    const prediction = await runReplicatePrediction(
      "anthropic/claude-3.5-sonnet",
      { 
        prompt: prompt,
        max_tokens: 1000,
        temperature: 0.5
      }
    );

    const resultText = Array.isArray(prediction.output) ? prediction.output.join("") : String(prediction.output);
    console.log("AI Raw Output:", resultText);

    try {
       // Attempt to find JSON in the output if there is extra text
       const jsonMatch = resultText.match(/\{[\s\S]*\}/);
       const jsonStr = jsonMatch ? jsonMatch[0] : resultText;
       const result = JSON.parse(jsonStr);
       
       return {
          status: (result.status === "APPROVED" || result.status === "approved") ? "approved" : "rejected",
          comment: result.comment || "Проверено ИИ"
       };
    } catch (e) {
       console.error("Failed to parse AI response", resultText);
       // Fallback: If it contains APPROVED but JSON is broken, approve.
       if (resultText.includes("APPROVED")) {
          return { status: "approved", comment: resultText };
       }
       return { status: "rejected", comment: "Ошибка при автоматической проверке. Пожалуйста, обратитесь к куратору." };
    }

  } catch (error) {
    console.error("AI Service error:", error);
    return { status: "rejected", comment: "Техническая ошибка проверки. Попробуйте позже." };
  }
}
