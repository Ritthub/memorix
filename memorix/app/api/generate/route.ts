import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { text } = await request.json()
    if (!text || text.trim().length < 50) {
      return NextResponse.json({ error: 'Texte trop court' }, { status: 400 })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Tu es un expert en mémorisation professionnelle. Ton rôle est d'extraire les informations ESSENTIELLES d'un document et de créer des flashcards permettant de les retenir parfaitement.

OBJECTIF : Quelqu'un qui connaît ces flashcards par coeur doit pouvoir répondre à toutes les questions pratiques sur ce document sans le relire.

RÈGLES STRICTES :
1. Chaque carte teste UN SEUL fait précis et vérifiable — pas un concept vague
2. Les questions doivent être SPÉCIFIQUES : inclure des chiffres exacts, des dates, des noms, des pourcentages quand le document en contient
3. INTERDIT : "Qu'est-ce que X ?", "Définissez X", "Expliquez X" — ces questions sont trop vagues
4. OBLIGATOIRE : "Quel est le montant de X ?", "Quelle est la date de Y ?", "Quel % représente Z ?", "Que se passe-t-il si... ?"
5. La réponse doit être courte et précise — idéalement un chiffre, une date, un nom, une condition
6. Couvre TOUS les éléments importants du document : chiffres clés, conditions, exceptions, délais, modalités

NIVEAUX DE DIFFICULTÉ :
- 1 : fait isolé simple (un chiffre, une date)
- 2 : relation entre deux éléments (si X alors Y)
- 3 : condition ou exception (dans quel cas...)
- 4 : calcul ou comparaison entre plusieurs éléments
- 5 : synthèse de plusieurs conditions interdépendantes

FORMAT JSON STRICT — réponds UNIQUEMENT avec ce tableau, sans texte avant ou après, sans markdown :
[{"q":"question précise","a":"réponse courte et exacte","expl":"contexte utile ou null","theme":"thème du document","difficulty":1}]

DOCUMENT À ANALYSER :
${text.slice(0, 8000)}`
        }]
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic error:', err)
      return NextResponse.json({ error: 'Erreur API Claude' }, { status: 500 })
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || ''

    const cleaned = content
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()

    let cards
    try {
      cards = JSON.parse(cleaned)
    } catch {
      console.error('Parse error:', cleaned)
      return NextResponse.json({ error: 'Erreur de parsing' }, { status: 500 })
    }

    return NextResponse.json({ cards })

  } catch (error) {
    console.error('Generate error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
