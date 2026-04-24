import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64 = buffer.toString("base64")

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              }
            },
            {
              type: "text",
              text: "Extrait tout le texte de ce document PDF. Retourne uniquement le texte brut, sans mise en forme, sans commentaire, sans markdown."
            }
          ]
        }]
      })
    })

      const err = await response.text()
      console.error("Claude PDF error:", err)
      return NextResponse.json({ error: "Erreur extraction PDF" }, { status: 500 })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || ""
    return NextResponse.json({ text })

  } catch (error) {
    console.error("Extract PDF error:", error)
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 })
  }
}
