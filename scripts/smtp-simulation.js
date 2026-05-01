const fs = require("fs")
const path = require("path")
const nodemailer = require("nodemailer")

function readEnvFile(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    env[key] = value
  }
  return env
}

async function main() {
  const envPath = path.join(process.cwd(), ".env.local")
  const env = readEnvFile(envPath)

  const user = String(env.SMTP_USER || "").trim()
  const pass = String(env.SMTP_PASS || "").trim()
  const host = String(env.SMTP_HOST || "smtp.gmail.com").trim()
  const port = Number.parseInt(String(env.SMTP_PORT || "587"), 10)
  const secure = String(env.SMTP_SECURE || "false").toLowerCase() === "true"

  if (!user || !pass) {
    console.log("SMTP_TEST_RESULT=FAIL;reason=SMTP credentials missing in .env.local")
    process.exit(1)
  }

  const transportProfiles = [
    { host, port, secure, label: "configured" },
    // Common Gmail fallback profile in case security mode is mismatched.
    { host: "smtp.gmail.com", port: 465, secure: true, label: "gmail_ssl_fallback" },
  ]

  const errors = []

  for (const profile of transportProfiles) {
    const transporter = nodemailer.createTransport({
      host: profile.host,
      port: profile.port,
      secure: profile.secure,
      auth: { user, pass },
    })

    try {
      await transporter.verify()

      const result = await transporter.sendMail({
        from: `\"QCC Attendance System\" <${user}>`,
        to: user,
        subject: "QCC SMTP Simulation",
        text: "SMTP simulation test from app environment succeeded.",
        html: "<p>SMTP simulation test from app environment succeeded.</p>",
      })

      console.log(
        `SMTP_TEST_RESULT=PASS;profile=${profile.label};host=${profile.host};port=${profile.port};secure=${profile.secure};messageId=${String(result.messageId || "")}`,
      )
      return
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      errors.push(`${profile.label}:${reason}`)
    }
  }

  console.log(`SMTP_TEST_RESULT=FAIL;reason=${errors.join(" | ")}`)
  process.exit(1)
}

main()
