import { NextResponse } from "next/server"
import { initializeApp } from "firebase/app"
import { getDatabase, ref, set, get } from "firebase/database"

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDQqXeoXC39yQC1NE9VlmzPvaN58FrAki8",
  authDomain: "esp32demo-955b3.firebaseapp.com",
  databaseURL: "https://esp32demo-955b3-default-rtdb.firebaseio.com",
  projectId: "esp32demo-955b3",
  storageBucket: "esp32demo-955b3.firebasestorage.app",
  messagingSenderId: "894485628740",
  appId: "1:894485628740:web:2a9231e0b351a61dc3f911",
  measurementId: "G-7CMEYSTTT5",
}

// Initialize Firebase
let app
let database

try {
  app = initializeApp(firebaseConfig)
  database = getDatabase(app)
} catch (error) {
  console.error("Firebase initialization error:", error)
}

export async function POST(request: Request) {
  if (!database) {
    return NextResponse.json({ error: "Firebase database is not available" }, { status: 500 })
  }

  try {
    const body = await request.json()
    const { name, finalScore, individualScores } = body

    if (typeof finalScore !== "number") {
      return NextResponse.json({ error: "Invalid score format" }, { status: 400 })
    }

    // Use a fixed path "scores/motorTest" instead of generating a new key
    const scoresRef = ref(database, "scores/motorTest")
    await set(scoresRef, {
      name: name || "Anonymous",
      finalScore,
      individualScores,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error saving score:", error)
    return NextResponse.json({ error: "Failed to save score" }, { status: 500 })
  }
}

export async function GET() {
  if (!database) {
    return NextResponse.json({ error: "Firebase database is not available" }, { status: 500 })
  }

  try {
    const scoresRef = ref(database, "scores")
    const snapshot = await get(scoresRef)

    if (!snapshot.exists()) {
      return NextResponse.json({ scores: [] })
    }

    const data = snapshot.val()
    const scores = Object.keys(data).map((key) => ({
      id: key,
      ...data[key],
    }))

    // Sort by score (highest first)
    scores.sort((a, b) => b.finalScore - a.finalScore)

    return NextResponse.json({ scores })
  } catch (error) {
    console.error("Error fetching scores:", error)
    return NextResponse.json({ error: "Failed to fetch scores" }, { status: 500 })
  }
}

