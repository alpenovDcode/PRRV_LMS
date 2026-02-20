const type = "quiz";
const content = { questions: [] };

function handleSave() {
  if (type === "quiz") {
    if (!content || !content.questions || !Array.isArray(content.questions) || content.questions.length === 0) {
      console.log("Error: Тест должен содержать хотя бы один вопрос");
      return;
    }
  }
  console.log("Success: Mutate called");
}

handleSave();
