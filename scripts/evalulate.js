const csv = require('csv-parser');
const fs = require('fs');
const fastCsv = require('fast-csv');
require('dotenv').config();

const MEDICAL_CHAT_CHAT_ENDPOINT = 'https://api.chat-data.com/api/v2/chat';

const fetchQuestionsFromCSV = (filename) => {
    return new Promise((resolve, reject) => {
        const rows = [];
        const uniqueQuestions = new Set();
        fs.createReadStream(filename)
            .pipe(csv())
            .on('data', (row) => {
                const question = row['Question'];
                const correctResponse = row['Correct response'];
                const chatGPTOutput = row['ChatGPT Output'];
                //Only answer the question which provides multiple choices
                if (question && question.includes('(A)') && !uniqueQuestions.has(question.trim())) {
                    const rowData = {
                        question: question,
                        correctResponse: correctResponse,
                        chatGPTOutput
                    };
                    rows.push(rowData);
                    uniqueQuestions.add(question.trim());
                }
            })
            .on('end', () => {
                resolve(rows);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
};

const fetchQuestionsFromJson = async (filename) => {
    const content = fs.readFileSync(filename, "utf8");
    const rows = content.split('\n');
    const array = [];
    for (const row of rows) {
        try {
            const rowJson = JSON.parse(row);
            array.push(rowJson);
        } catch (err) {
            console.log(row);
        }
    }
    return array;
};

const getMedicalAnswer = async (question) => {
    const data = {
        chatbotId: process.env.CHATBOT_ID,
        stream: false,
        temperature: 0,
        messages: [
            { role: 'user', content: question }
        ],
        markdown: false
    };

    const headers = {
        'Authorization': `Bearer ${process.env.API_KEY}`,
        'Content-Type': 'application/json'
    };

    const response = await fetch(MEDICAL_CHAT_CHAT_ENDPOINT, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data)
    });
    const result = await response.text();
    return result;
}

const saveUSMLEResultsToCsv = (questions, outputFilename) => {
    return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(outputFilename);

        const data = questions.map(question => ({
            ['Question']: question.question,
            ['Correct response']: question.correctResponse,
            ['Medical Chat Output']: question.medicalChatOutput,
            ['ChatGPT Output']: question.chatGPTOutput,
        }));

        fastCsv.write(data, { headers: true })
            .pipe(writeStream)
            .on('finish', () => {
                console.log('Questions saved to CSV:', outputFilename);
                resolve(outputFilename);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
};

const saveMedQAResultsToCsv = (questions, outputFilename) => {
    return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(outputFilename);

        const data = questions.map(question => ({
            ['Question']: question.question,
            ['Correct response']: question.correctResponse,
            ['Medical Chat Output']: question.medicalChatOutput,
        }));

        fastCsv.write(data, { headers: true })
            .pipe(writeStream)
            .on('finish', () => {
                console.log('Questions saved to CSV:', outputFilename);
                resolve(outputFilename);
            })
            .on('error', (error) => {
                reject(error);
            });
    });
};

(async () => {
    try {
        const csvFileSets = [
            {
                input: 'test_datasets/USMLE/Medical Chat USMLE Correctness Check - Test 1.csv',
                output: 'output_results/USMLE/Medical Chat USMLE Correctness Check - Test 1 (Output).csv'
            },
            {
                input: 'test_datasets/USMLE/Medical Chat USMLE Correctness Check - Test 2.csv',
                output: 'output_results/USMLE/Medical Chat USMLE Correctness Check - Test 2 (Output).csv'
            },
            {
                input: 'test_datasets/USMLE/Medical Chat USMLE Correctness Check - Test 3.csv',
                output: 'output_results/USMLE/Medical Chat USMLE Correctness Check - Test 3 (Output).csv'
            },
        ]
        for (const fileset of csvFileSets) {
            const questions = await fetchQuestionsFromCSV(fileset.input);
            const finalData = [];
            for (const question of questions) {
                const result = await getMedicalAnswer(question.question);
                finalData.push({
                    ...question,
                    medicalChatOutput: result,
                })
            }
            saveUSMLEResultsToCsv(finalData, fileset.output)
        }
        const medQAFileSets = [
            {
                input: 'test_datasets/MedQA/US/MedQA Correctness Check - US.jsonl',
                output: 'output_results/MedQA/US/Medical Chat MedQA Correctness Check - US (Output).csv'
            },
        ]
        for (const fileset of medQAFileSets) {
            const questions = await fetchQuestionsFromJson(fileset.input);
            const finalData = [];
            for (const question of questions) {
                const completeQuestion = `${question.question}\nOptions:\n${Object.entries(question.options).map(([key, value]) => `(${key}): ${value}`).join('\n')}\n`
                const result = await getMedicalAnswer(completeQuestion);
                console.log({
                    question: completeQuestion,
                    correctResponse: question.answer,
                    medicalChatOutput: result,
                })
                finalData.push({
                    question: completeQuestion,
                    correctResponse: question.answer,
                    medicalChatOutput: result,
                })
            }
            saveMedQAResultsToCsv(finalData, fileset.output)
        }

    } catch (err) {
        console.error('Error:', err);
    }
})();
