const axios = require("axios");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

// generate interview report
async function generateInterviewReport({ resume, selfDescription, jobDescription }) {

    const prompt = `
You are an expert technical interviewer.

Generate a high-quality interview report.

rules:
- output only json
- matchScore must be integer (0–100)
- each technical question must include: question, intention, answer
- each behavioral question must include: question, intention, answer
- do not repeat questions
- generate at least 10 technical and 6 behavioral questions

resume:
${resume || "Not provided"}

self description:
${selfDescription || "Not provided"}

job description:
${jobDescription}

return json:
{
  "title": "string",
  "matchScore": number,
  "technicalQuestions": [],
  "behavioralQuestions": [],
  "skillGaps": [],
  "preparationPlan": []
}
`;

    const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
            model: "openai/gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }]
        },
        {
            headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            }
        }
    );

    const text = response.data.choices[0].message.content;
    const cleaned = text.replace(/```json|```/g, "").trim();

    let result;

    try {
        result = JSON.parse(cleaned);
    } catch (err) {
        console.log("json error:", cleaned);
        throw new Error("invalid ai response");
    }

    result.matchScore = result.matchScore <= 1
        ? Math.round(result.matchScore * 100)
        : Math.round(result.matchScore);

    const normalizeQuestion = (q, type) => {
        if (typeof q === "string") {
            return {
                question: q,
                intention: type === "tech"
                    ? "evaluate technical understanding"
                    : "evaluate behavior and communication",
                answer: type === "tech"
                    ? "explain with examples"
                    : "use star method"
            };
        }

        return {
            question: q.question || "explain a concept",
            intention: q.intention || (
                type === "tech"
                    ? "evaluate technical understanding"
                    : "evaluate behavior and communication"
            ),
            answer: q.answer || (
                type === "tech"
                    ? "explain with examples"
                    : "use star method"
            )
        };
    };

    result.technicalQuestions = (result.technicalQuestions || [])
        .map(q => normalizeQuestion(q, "tech"));

    result.behavioralQuestions = (result.behavioralQuestions || [])
        .map(q => normalizeQuestion(q, "behav"));

    const removeDuplicates = (arr) => {
        const seen = new Set();
        return arr.filter(q => {
            const key = q.question.trim().toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };

    result.technicalQuestions = removeDuplicates(result.technicalQuestions);
    result.behavioralQuestions = removeDuplicates(result.behavioralQuestions);

    const expandQuestions = (arr, minCount) => {
        let i = 0;

        while (arr.length < minCount && arr.length > 0) {
            const base = arr[i % arr.length];

            const newQuestion = {
                question: base.question + " (variation)",
                intention: base.intention,
                answer: base.answer
            };

            if (!arr.some(q => q.question === newQuestion.question)) {
                arr.push(newQuestion);
            }

            i++;
            if (i > 20) break;
        }

        return arr;
    };

    result.technicalQuestions = expandQuestions(result.technicalQuestions, 10);
    result.behavioralQuestions = expandQuestions(result.behavioralQuestions, 6);

    return result;
}

// generating pdf from html
async function generatePdfFromHtml(htmlContent) {
    const browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
        format: "A4",
        margin: {
            top: "20mm",
            bottom: "20mm",
            left: "15mm",
            right: "15mm"
        }
    });

    await browser.close();
    return pdfBuffer;
}

// resume pdf
async function generateResumePdf({ resume, selfDescription, jobDescription }) {

    const prompt = `
You are a professional resume writer.

generate ats-friendly resume in html.

rules:
- output only json
- must contain "html"
- html must be complete

resume:
${resume || "Not provided"}

self description:
${selfDescription || "Not provided"}

job description:
${jobDescription}

return:
{
  "html": "<!DOCTYPE html>...complete resume..."
}
`;

    const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
            model: "openai/gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }]
        },
        {
            headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            }
        }
    );

    const text = response.data.choices[0].message.content;
    const cleaned = text.replace(/```json|```/g, "").trim();

    let htmlContent = "";

    try {
        const jsonContent = JSON.parse(cleaned);
        htmlContent = jsonContent.html;
    } catch (err) {
        htmlContent = cleaned;
    }

    if (!htmlContent || htmlContent.length < 50) {
        throw new Error("invalid html generated");
    }

    return await generatePdfFromHtml(htmlContent);
}

module.exports = { generateInterviewReport, generateResumePdf };