const axios = require("axios");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");


async function generateInterviewReport({ resume, selfDescription, jobDescription }) {

    const prompt = `
You are an expert technical interviewer.

Generate a HIGH-QUALITY interview report.

⚠️ RULES:
- Output ONLY JSON
- matchScore must be INTEGER (0–100)
- Generate detailed structured questions

Resume:
${resume || "Not provided"}

Self Description:
${selfDescription || "Not provided"}

Job Description:
${jobDescription}

Return JSON format:
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
        console.log("JSON ERROR:", cleaned);
        throw new Error("Invalid AI response");
    }

    if (result.matchScore <= 1) {
        result.matchScore = Math.round(result.matchScore * 100);
    } else {
        result.matchScore = Math.round(result.matchScore);
    }


    // Technical Questions
    result.technicalQuestions = (result.technicalQuestions || []).map(q => {
        if (typeof q === "string") {
            return {
                question: q,
                intention: "To evaluate technical understanding",
                answer: "Explain clearly with examples"
            };
        }
        return q;
    });

    // Behavioral Questions
    result.behavioralQuestions = (result.behavioralQuestions || []).map(q => {
        if (typeof q === "string") {
            return {
                question: q,
                intention: "To evaluate communication and behavior",
                answer: "Use STAR method"
            };
        }
        return q;
    });

    // Skill Gaps
    result.skillGaps = (result.skillGaps || []).map(s => {
        if (typeof s === "string") {
            return {
                skill: s,
                severity: "medium"
            };
        }
        return s;
    });

    // Preparation Plan
    result.preparationPlan = (result.preparationPlan || []).map((p, i) => {
        if (typeof p === "string") {
            return {
                day: i + 1,
                focus: "General Preparation",
                tasks: [p]
            };
        }
        return p;
    });

    // fixing questions count

    while (result.technicalQuestions.length < 10) {
        result.technicalQuestions.push({
            question: "Explain a core concept from your domain.",
            intention: "Evaluate technical understanding",
            answer: "Explain with examples"
        });
    }

    while (result.behavioralQuestions.length < 6) {
        result.behavioralQuestions.push({
            question: "Describe a challenging situation you handled.",
            intention: "Evaluate communication",
            answer: "Use STAR method"
        });
    }

    return result;
}

// PDF Generation

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

// RESUME Generation

async function generateResumePdf({ resume, selfDescription, jobDescription }) {

    const prompt = `
You are a professional resume writer.

Generate ATS-friendly resume in HTML.

⚠️ RULES:
- Output ONLY JSON
- Must contain "html"
- HTML must be complete

Resume:
${resume || "Not provided"}

Self Description:
${selfDescription || "Not provided"}

Job Description:
${jobDescription}

Return:
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
        console.log("JSON ERROR:", cleaned);
        htmlContent = cleaned; 
    }

    if (!htmlContent || htmlContent.length < 50) {
        throw new Error("Invalid HTML generated");
    }

    return await generatePdfFromHtml(htmlContent);
}

module.exports = { generateInterviewReport, generateResumePdf };