const axios = require("axios");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

// interview report
async function generateInterviewReport({ resume, selfDescription, jobDescription }) {

    const prompt = `
        You are an expert technical interviewer.

        Generate a high-quality interview report.

        rules:
        - output only json
        - matchScore must be integer (0–100)
        - do not repeat questions

        VERY IMPORTANT:
        - each technical question MUST include:
          question, intention, answer
        - each behavioral question MUST include:
          question, intention, answer
        - DO NOT leave intention or answer empty
        - answers must be specific to the question (not generic)

        - you must compare resume, self description, and job description (if provided)
        - if job description is not provided, evaluate candidate based on resume and self description only
        - if profile is unrelated, matchScore must be LOW

        resume:
        ${resume || "Not provided"}

        self description:
        ${selfDescription || "Not provided"}

        job description:
        ${jobDescription || "Not provided"}

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
        console.log("raw ai response:", cleaned);
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
            result = JSON.parse(match[0]);
        } else {
            throw new Error("invalid ai response");
        }
    }

    if (typeof result.matchScore === "number") {
        result.matchScore = result.matchScore <= 1
            ? Math.round(result.matchScore * 100)
            : Math.round(result.matchScore);
    }

    const validateQuestions = (arr) => {
        return (arr || []).filter(q =>
            q &&
            q.question &&
            q.intention &&
            q.answer &&
            q.question.trim() !== "" &&
            q.intention.trim() !== "" &&
            q.answer.trim() !== ""
        );
    };

    result.technicalQuestions = validateQuestions(result.technicalQuestions);
    result.behavioralQuestions = validateQuestions(result.behavioralQuestions);

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

    result.skillGaps = (result.skillGaps || []).map(s => {
        if (typeof s === "string") {
            return {
                skill: s,
                severity: "medium"
            };
        }

        return {
            skill: s.skill || "general skill",
            severity: s.severity || "medium"
        };
    });

    // roadmap
    result.preparationPlan = (result.preparationPlan || []).map((p, i) => {

        const extractShortTitle = (text) => {
            if (!text) return "focused practice";
            const words = text.split(" ");
            return words.slice(0, 4).join(" ");
        };

        if (typeof p === "string") {
            return {
                day: i + 1,
                focus: extractShortTitle(p),
                tasks: [p]
            };
        }

        const taskText = Array.isArray(p.tasks) && p.tasks.length > 0
            ? p.tasks[0]
            : p.focus || p.title;

        return {
            day: p.day || i + 1,
            focus: p.focus && p.focus.length < 40
                ? p.focus
                : extractShortTitle(taskText),
            tasks: Array.isArray(p.tasks) && p.tasks.length > 0
                ? p.tasks
                : [taskText || "practice fundamentals"]
        };
    });

    let score = 100;

    (result.skillGaps || []).forEach(gap => {
        const severity = (gap.severity || "").toLowerCase();

        if (severity === "low") score -= 5;
        else if (severity === "medium") score -= 10;
        else if (severity === "high") score -= 15;
        else score -= 10;
    });

    score = Math.max(score, 10);
    result.matchScore = score;

    return result;
}

// pdf generation
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

// resume generation 
async function generateResumePdf({ resume, selfDescription, jobDescription }) {

    const prompt = `
You are a professional resume writer.

generate ats-friendly resume in html.

rules:
- output only json
- must contain "html"

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