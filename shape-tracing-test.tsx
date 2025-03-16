"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { initializeApp } from "firebase/app"
// Add this import at the top with the other Firebase imports
import { getDatabase, ref, set } from "firebase/database"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
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

type Point = {
  x: number
  y: number
}

type Shape = {
  name: string
  generateTemplate: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
  getIdealPoints: (width: number, height: number) => Point[]
  leniencyFactor: number // Higher value = more lenient scoring
}

export default function ShapeTracingTest() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentShapeIndex, setCurrentShapeIndex] = useState(0)
  const [userPoints, setUserPoints] = useState<Point[]>([])
  const [currentScore, setCurrentScore] = useState<number | null>(null)
  const [scores, setScores] = useState<number[]>([])
  const [testCompleted, setTestCompleted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Remove this line:
  //const [userName, setUserName] = useState("")

  const shapes: Shape[] = [
    {
      name: "Straight Line",
      generateTemplate: (ctx, width, height) => {
        ctx.beginPath()
        ctx.moveTo(width * 0.2, height * 0.5)
        ctx.lineTo(width * 0.8, height * 0.5)
        ctx.stroke()
      },
      getIdealPoints: (width, height) => {
        const points: Point[] = []
        for (let x = width * 0.2; x <= width * 0.8; x += 5) {
          points.push({ x, y: height * 0.5 })
        }
        return points
      },
      leniencyFactor: 1.0, // Standard leniency
    },
    {
      name: "Z Shape",
      generateTemplate: (ctx, width, height) => {
        ctx.beginPath()
        ctx.moveTo(width * 0.2, height * 0.3)
        ctx.lineTo(width * 0.8, height * 0.3)
        ctx.lineTo(width * 0.2, height * 0.7)
        ctx.lineTo(width * 0.8, height * 0.7)
        ctx.stroke()
      },
      getIdealPoints: (width, height) => {
        const points: Point[] = []
        // Top horizontal line
        for (let x = width * 0.2; x <= width * 0.8; x += 5) {
          points.push({ x, y: height * 0.3 })
        }
        // Diagonal line
        const steps = 20
        for (let i = 0; i <= steps; i++) {
          points.push({
            x: width * 0.8 - (i / steps) * (width * 0.6),
            y: height * 0.3 + (i / steps) * (height * 0.4),
          })
        }
        // Bottom horizontal line
        for (let x = width * 0.2; x <= width * 0.8; x += 5) {
          points.push({ x, y: height * 0.7 })
        }
        return points
      },
      leniencyFactor: 1.0, // Standard leniency
    },
    {
      name: "Semi-Circle",
      generateTemplate: (ctx, width, height) => {
        ctx.beginPath()
        ctx.arc(width * 0.5, height * 0.5, width * 0.3, 0, Math.PI, false)
        ctx.stroke()
      },
      getIdealPoints: (width, height) => {
        const points: Point[] = []
        const centerX = width * 0.5
        const centerY = height * 0.5
        const radius = width * 0.3
        for (let angle = 0; angle <= Math.PI; angle += 0.1) {
          points.push({
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
          })
        }
        return points
      },
      leniencyFactor: 1.3, // Slightly more lenient scoring for semi-circle
    },
    {
      name: "Circle",
      generateTemplate: (ctx, width, height) => {
        ctx.beginPath()
        ctx.arc(width * 0.5, height * 0.5, width * 0.3, 0, Math.PI * 2, false)
        ctx.stroke()
      },
      getIdealPoints: (width, height) => {
        const points: Point[] = []
        const centerX = width * 0.5
        const centerY = height * 0.5
        const radius = width * 0.3
        for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
          points.push({
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle),
          })
        }
        return points
      },
      leniencyFactor: 1.3, // Slightly more lenient scoring for circle
    },
  ]

  // Initialize canvas and draw the first shape template
  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas dimensions
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw template shape
    ctx.strokeStyle = "#888888"
    ctx.lineWidth = 4
    shapes[currentShapeIndex].generateTemplate(ctx, canvas.width, canvas.height)

    // Draw user's path if any
    if (userPoints.length > 0) {
      ctx.strokeStyle = "#3b82f6"
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.moveTo(userPoints[0].x, userPoints[0].y)
      for (let i = 1; i < userPoints.length; i++) {
        ctx.lineTo(userPoints[i].x, userPoints[i].y)
      }
      ctx.stroke()
    }
  }, [currentShapeIndex, userPoints])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current) return
      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      // Save current drawing
      const userPointsCopy = [...userPoints]

      // Resize canvas
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight

      // Redraw template
      ctx.strokeStyle = "#888888"
      ctx.lineWidth = 4
      shapes[currentShapeIndex].generateTemplate(ctx, canvas.width, canvas.height)

      // Redraw user path
      if (userPointsCopy.length > 0) {
        ctx.strokeStyle = "#3b82f6"
        ctx.lineWidth = 4
        ctx.beginPath()
        ctx.moveTo(userPointsCopy[0].x, userPointsCopy[0].y)
        for (let i = 1; i < userPointsCopy.length; i++) {
          ctx.lineTo(userPointsCopy[i].x, userPointsCopy[i].y)
        }
        ctx.stroke()
      }
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [currentShapeIndex, userPoints])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (testCompleted) return

    e.preventDefault() // Prevent default behavior
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setUserPoints([{ x, y }])
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (testCompleted) return

    e.preventDefault() // Prevent scrolling while drawing
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const touch = e.touches[0]
    const x = touch.clientX - rect.left
    const y = touch.clientY - rect.top
    setUserPoints([{ x, y }])
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || testCompleted) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setUserPoints((prev) => [...prev, { x, y }])
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || testCompleted) return

    e.preventDefault() // Prevent scrolling while drawing
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const touch = e.touches[0]
    const x = touch.clientX - rect.left
    const y = touch.clientY - rect.top
    setUserPoints((prev) => [...prev, { x, y }])
  }

  const handleMouseUp = () => {
    if (!isDrawing || testCompleted) return

    setIsDrawing(false)
    calculateScore()
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || testCompleted) return

    e.preventDefault()
    setIsDrawing(false)
    calculateScore()
  }

  const calculateScore = () => {
    if (!canvasRef.current || userPoints.length < 2) return

    const canvas = canvasRef.current
    const idealPoints = shapes[currentShapeIndex].getIdealPoints(canvas.width, canvas.height)
    const leniencyFactor = shapes[currentShapeIndex].leniencyFactor

    // Calculate accuracy (distance from ideal points)
    const accuracyScore = calculateAccuracyScore(userPoints, idealPoints, leniencyFactor)

    // Calculate completeness (coverage of the shape)
    const completenessScore = calculateCompletenessScore(userPoints, idealPoints, leniencyFactor)

    // Calculate smoothness (penalize jagged lines)
    const smoothnessScore = calculateSmoothnessScore(userPoints)

    // Calculate shape matching (overall structure)
    const shapeMatchingScore = calculateShapeMatchingScore(userPoints, idealPoints, leniencyFactor)

    // Weighted final score
    const finalScore = Math.round(
      accuracyScore * 0.4 + completenessScore * 0.3 + smoothnessScore * 0.1 + shapeMatchingScore * 0.2,
    )

    setCurrentScore(Math.min(100, finalScore)) // Cap at 100
  }

  const calculateAccuracyScore = (userPoints: Point[], idealPoints: Point[], leniencyFactor: number): number => {
    if (userPoints.length === 0) return 0

    let totalDistance = 0

    // For each user point, find the closest ideal point
    for (const userPoint of userPoints) {
      let minDistance = Number.POSITIVE_INFINITY

      for (const idealPoint of idealPoints) {
        const distance = Math.sqrt(Math.pow(userPoint.x - idealPoint.x, 2) + Math.pow(userPoint.y - idealPoint.y, 2))
        minDistance = Math.min(minDistance, distance)
      }

      totalDistance += minDistance
    }

    // Average distance
    const avgDistance = totalDistance / userPoints.length

    // Convert to a score (lower distance = higher score)
    // Adjust max distance based on leniency factor
    const maxDistance = 50 * leniencyFactor
    const accuracyScore = Math.max(0, 100 - (avgDistance / maxDistance) * 100)

    return accuracyScore
  }

  const calculateCompletenessScore = (userPoints: Point[], idealPoints: Point[], leniencyFactor: number): number => {
    if (userPoints.length === 0 || idealPoints.length === 0) return 0

    let coveredIdealPoints = 0

    // For each ideal point, check if there's a user point close to it
    for (const idealPoint of idealPoints) {
      let minDistance = Number.POSITIVE_INFINITY

      for (const userPoint of userPoints) {
        const distance = Math.sqrt(Math.pow(userPoint.x - idealPoint.x, 2) + Math.pow(userPoint.y - idealPoint.y, 2))
        minDistance = Math.min(minDistance, distance)
      }

      // If a user point is close enough to this ideal point, consider it covered
      // Adjust threshold based on leniency factor
      if (minDistance < 30 * leniencyFactor) {
        coveredIdealPoints++
      }
    }

    // Calculate coverage percentage
    const coveragePercentage = (coveredIdealPoints / idealPoints.length) * 100

    return coveragePercentage
  }

  const calculateSmoothnessScore = (userPoints: Point[]): number => {
    if (userPoints.length < 3) return 100 // Not enough points to measure smoothness

    let totalAngleChange = 0

    // Calculate angle changes between consecutive segments
    for (let i = 1; i < userPoints.length - 1; i++) {
      const prev = userPoints[i - 1]
      const current = userPoints[i]
      const next = userPoints[i + 1]

      // Calculate vectors
      const v1 = { x: current.x - prev.x, y: current.y - prev.y }
      const v2 = { x: next.x - current.x, y: next.y - current.y }

      // Calculate magnitudes
      const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y)
      const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y)

      // Avoid division by zero
      if (mag1 === 0 || mag2 === 0) continue

      // Calculate dot product
      const dotProduct = v1.x * v2.x + v1.y * v2.y

      // Calculate angle (in radians)
      const cosAngle = dotProduct / (mag1 * mag2)
      const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)))

      totalAngleChange += angle
    }

    // Average angle change
    const avgAngleChange = totalAngleChange / (userPoints.length - 2)

    // Convert to a score (lower angle change = higher score)
    // PI radians (180 degrees) is the maximum angle change
    const smoothnessScore = Math.max(0, 100 - (avgAngleChange / Math.PI) * 100)

    return smoothnessScore
  }

  const calculateShapeMatchingScore = (userPoints: Point[], idealPoints: Point[], leniencyFactor: number): number => {
    if (userPoints.length === 0 || idealPoints.length === 0) return 0

    // Calculate bounding boxes
    const userBounds = getBoundingBox(userPoints)
    const idealBounds = getBoundingBox(idealPoints)

    // Calculate aspect ratio similarity
    const userAspectRatio = (userBounds.maxX - userBounds.minX) / (userBounds.maxY - userBounds.minY || 1)
    const idealAspectRatio = (idealBounds.maxX - idealBounds.minX) / (idealBounds.maxY - idealBounds.minY || 1)

    const aspectRatioDiff = Math.abs(userAspectRatio - idealAspectRatio)
    // Apply leniency factor to aspect ratio scoring
    const aspectRatioScore = Math.max(0, 100 - (aspectRatioDiff * 50) / leniencyFactor)

    // Calculate center point similarity
    const userCenterX = (userBounds.minX + userBounds.maxX) / 2
    const userCenterY = (userBounds.minY + userBounds.maxY) / 2
    const idealCenterX = (idealBounds.minX + idealBounds.maxX) / 2
    const idealCenterY = (idealBounds.minY + idealBounds.maxY) / 2

    const centerDistance = Math.sqrt(Math.pow(userCenterX - idealCenterX, 2) + Math.pow(userCenterY - idealCenterY, 2))

    // Convert to a score (lower distance = higher score)
    // Apply leniency factor to center distance scoring
    const centerScore = Math.max(0, 100 - (centerDistance / (50 * leniencyFactor)) * 100)

    // Combine scores
    return aspectRatioScore * 0.5 + centerScore * 0.5
  }

  const getBoundingBox = (points: Point[]) => {
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const point of points) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }

    return { minX, minY, maxX, maxY }
  }

  const handleReset = () => {
    setUserPoints([])
    setCurrentScore(null)
  }

  const handleNext = () => {
    if (currentScore !== null) {
      setScores((prev) => [...prev, currentScore])

      if (currentShapeIndex < shapes.length - 1) {
        setCurrentShapeIndex((prev) => prev + 1)
        setUserPoints([])
        setCurrentScore(null)
      } else {
        setTestCompleted(true)
      }
    }
  }

  const handleStartOver = () => {
    setCurrentShapeIndex(0)
    setUserPoints([])
    setCurrentScore(null)
    setScores([])
    setTestCompleted(false)
    setSubmitSuccess(false)
    setSubmitError(null)
  }

  const calculateFinalScore = () => {
    if (scores.length === 0) return 0
    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
  }

  // Replace the handleSubmitScore function with this updated version
  const handleSubmitScore = async () => {
    if (!database) {
      setSubmitError("Firebase database is not available. Please try again later.")
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      // Use a fixed path "scores/motorTest" instead of generating a new key
      const scoresRef = ref(database, "scores/motorTest")
      await set(scoresRef, {
        name: "Anonymous", // Always use "Anonymous" instead of userName
        finalScore: calculateFinalScore(),
        individualScores: scores,
        timestamp: new Date().toISOString(),
      })

      setSubmitSuccess(true)
    } catch (error) {
      console.error("Error submitting score:", error)
      setSubmitError("Failed to submit score. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  // Prevent default touch behavior on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const preventDefaultTouch = (e: TouchEvent) => {
      e.preventDefault()
    }

    canvas.addEventListener("touchstart", preventDefaultTouch, { passive: false })
    canvas.addEventListener("touchmove", preventDefaultTouch, { passive: false })
    canvas.addEventListener("touchend", preventDefaultTouch, { passive: false })

    return () => {
      canvas.removeEventListener("touchstart", preventDefaultTouch)
      canvas.removeEventListener("touchmove", preventDefaultTouch)
      canvas.removeEventListener("touchend", preventDefaultTouch)
    }
  }, [])

  // Add this useEffect hook to prevent UI dragging on first load
  useEffect(() => {
    // Prevent default behavior for the entire document on first load
    const preventDragHandler = (e: Event) => {
      if (e.target === canvasRef.current) {
        e.preventDefault()
      }
    }

    // Add these event listeners to the document
    document.addEventListener("dragstart", preventDragHandler, { passive: false })
    document.addEventListener("drop", preventDragHandler, { passive: false })

    // Clean up
    return () => {
      document.removeEventListener("dragstart", preventDragHandler)
      document.removeEventListener("drop", preventDragHandler)
    }
  }, [])

  return (
    <div className="flex flex-col items-center max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Shape Tracing Test</h1>

      {!testCompleted ? (
        <>
          <div className="w-full mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-xl">
                Test {currentShapeIndex + 1} of {shapes.length}: {shapes[currentShapeIndex].name}
              </span>
              {currentScore !== null && <span className="text-xl font-semibold">Score: {currentScore}/100</span>}
            </div>
            <Progress value={(currentShapeIndex / shapes.length) * 100} className="h-3" />
          </div>

          <Card className="w-full mb-6 p-6 shadow-lg">
            <canvas
              ref={canvasRef}
              width={600}
              height={400}
              // Update the canvas className to include additional properties to prevent dragging
              // Find the canvas element and update its className
              className="w-full h-[400px] border-2 border-gray-300 rounded-lg touch-none select-none cursor-crosshair"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
          </Card>

          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
            <Button onClick={handleReset} variant="outline" size="lg" className="text-lg py-6 flex-1">
              Reset
            </Button>
            <Button onClick={handleNext} disabled={currentScore === null} size="lg" className="text-lg py-6 flex-1">
              {currentShapeIndex < shapes.length - 1 ? "Next Test" : "Finish"}
            </Button>
          </div>

          <div className="mt-6 text-lg bg-blue-50 p-4 rounded-lg border border-blue-200 w-full">
            <h3 className="font-bold mb-2">Instructions:</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Trace the gray shape as accurately as possible</li>
              <li>Click and drag (or touch and drag) to draw</li>
              <li>Release to submit your drawing</li>
              <li>Press "Reset" if you want to try again</li>
              <li>Press "Next Test" when you're satisfied with your score</li>
            </ul>
          </div>
        </>
      ) : (
        <div className="w-full text-center">
          <h2 className="text-2xl font-bold mb-6">Test Completed!</h2>

          <Card className="p-8 mb-8 shadow-lg">
            <div className="mb-8">
              <div className="text-5xl font-bold mb-3">{calculateFinalScore()}/100</div>
              <p className="text-xl">Final Score</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {scores.map((score, index) => (
                <div key={index} className="p-4 border-2 rounded-lg bg-gray-50">
                  <div className="font-bold text-lg">{shapes[index].name}</div>
                  <div className="text-2xl">{score}/100</div>
                </div>
              ))}
            </div>

            {!submitSuccess ? (
              <div className="mb-6">
                {/* Remove these lines:
                <div className="mb-4">
                  <label htmlFor="userName" className="block text-lg mb-2 text-left">
                    Your Name (optional):
                  </label>
                  <input
                    id="userName"
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full p-3 text-lg border-2 rounded-lg"
                    placeholder="Enter your name"
                  />
                </div>
                */}

                <div className="flex flex-col sm:flex-row gap-4">
                  <Button onClick={handleStartOver} variant="outline" size="lg" className="text-lg py-6 flex-1">
                    Start Over
                  </Button>
                  <Button onClick={handleSubmitScore} disabled={submitting} size="lg" className="text-lg py-6 flex-1">
                    {submitting ? "Submitting..." : "Submit Score"}
                  </Button>
                </div>

                {submitError && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <div className="mb-6">
                <Alert className="mb-4 bg-green-50 border-green-200">
                  <AlertTitle className="text-green-800 text-lg">Success!</AlertTitle>
                  <AlertDescription className="text-green-700">
                    Your score has been submitted successfully.
                  </AlertDescription>
                </Alert>

                <Button onClick={handleStartOver} size="lg" className="text-lg py-6">
                  Start New Test
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

