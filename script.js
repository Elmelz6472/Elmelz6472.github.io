import { PoseLandmarker, ObjectDetector, FilesetResolver, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";
const demosSection = document.getElementById("demos");
const video = document.getElementById("webcam");
const liveView = document.getElementById("liveView");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const drawingUtils = new DrawingUtils(canvasCtx);
const scaleFactor = 1;

let flag_selected;
let runningMode = "IMAGE";
let objectDetector = undefined;
let poseLandmarker = undefined;

let collisionCount = 0;
let collisionDelay = 500; // Delay in ms
let lastCollisionTime = 0;

let frameCount = 0;
let fpsInterval, startTime, now, then, elapsed;



const limbLabel = {
    0: "LEFT_SHOULDER",
    1: "RIGHT_SHOULDER",
    2: "RIGHT_KNEE",
}












// Initialize the object detector
const initializeObjectDetector = async () => {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
    objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `efficientdet_lite2.tflite`,
            delegate: "GPU"
        },
        scoreThreshold: .035,
        maxResults: 1,
        categoryAllowlist: ["sports ball"],
        runningMode: runningMode
    });
    demosSection.classList.remove("invisible");
};
initializeObjectDetector();

// Initialize the poseLandmarker detector
const createPoseLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
            delegate: "GPU"
        },
        runningMode: runningMode,
        numPoses: 1,
        minPosePresenceConfidence: 0.7,
        minTrackingConfidence: 0.7,
        minPoseDetectionConfidence: 0.7,
    });
    demosSection.classList.remove("invisible");
};
createPoseLandmarker();

let enableWebcamButton;
const disableWebcamButton = document.getElementById('disableWebcamButton');

disableWebcamButton.addEventListener('click', () => {
    const mediaStream = document.getElementById('webcam').srcObject;
    if (mediaStream) {
        const tracks = mediaStream.getTracks();
        tracks.forEach((track) => {
            track.stop();
        });
    }
    disableWebcamButton.style.display = 'none';
    webcamButton.style.display = 'block';
});

function hasGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

if (hasGetUserMedia()) {
    enableWebcamButton = document.getElementById("webcamButton");
    enableWebcamButton.addEventListener("click", enableCam);
}
else {
    console.warn("getUserMedia() is not supported by your browser");
}

function checkObjectDetector() {
    if (!objectDetector) {
        console.log("Wait! objectDetector not loaded yet.");
        return false;
    }
    return true;
}

function getTrackingPreference() {
    // const trackingPreference = document.querySelector('input[name="tracking"]:checked').value;
    const trackingPreference = "both";
    return trackingPreference;
}

function toggleWebcamButtons() {
    enableWebcamButton.classList.add("removed");
    webcamButton.style.display = 'none';
    disableWebcamButton.style.display = 'block';
}

async function enableCam(event) {
    if (!checkObjectDetector()) return;
    toggleWebcamButtons();
    const constraints = {
        video: true
    };
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.addEventListener("loadeddata", predictWebcam);
    } catch (err) {
        console.error(err);
    }
    flag_selected = getTrackingPreference();
}

function processLandmarks(landmarks) {
    // return [landmarks[12], landmarks[11], landmarks[26], landmarks[28], landmarks[30], landmarks[25], landmarks[27], landmarks[29], landmarks[31]];
    return [landmarks[12], landmarks[11], landmarks[26], landmarks[30], landmarks[25], landmarks[31]];

}

const videoHeight = "540px";
const videoWidth = "720px";
let lastVideoTime = -1;

async function setRunningMode() {
    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await objectDetector.setOptions({ runningMode: "VIDEO" });
        await poseLandmarker.setOptions({ runningMode: "VIDEO" });
    }
}

async function predictWebcam() {
    canvasElement.style.height = videoHeight;
    canvasElement.style.width = videoWidth;
    video.style.height = videoHeight;
    video.style.width = videoWidth;

    await setRunningMode();
    let startTimeMs = performance.now();

    if (video.currentTime !== lastVideoTime && flag_selected) {
        lastVideoTime = video.currentTime;

        poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
            canvasCtx.save();
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;

            result.landmarks.forEach(landmark => {
                let new_landmark = processLandmarks(landmark);
                let new_radius = (data) => DrawingUtils.lerp(data.from.z, -20, 20, 150, 1)
                drawingUtils.drawLandmarks(new_landmark, {
                    radius: new_radius
                });

                // Loop through new_landmark instead of a single landmark
                new_landmark.forEach((singleLandmark, index) => {
                    const circle = {
                        x: singleLandmark.x * videoWidth,
                        y: singleLandmark.y * videoHeight,
                        radius: 25, // Or whatever the radius of the landmark is
                        id: index
                    };

                    children.forEach(child => {
                        if (child.className === 'highlighter') {
                            const highlightBox = {
                                x: parseInt(child.style.left),
                                y: parseInt(child.style.top),
                                width: parseInt(child.style.width),
                                height: parseInt(child.style.height)
                            };

                            if (isCollision(circle, highlightBox)) {
                                if (performance.now() - lastCollisionTime > collisionDelay) {
                                    collisionCount++;
                                    lastCollisionTime = performance.now();
                                    // Update the counter in the HTML
                                    document.getElementById("collisionCounter").textContent = collisionCount;
                                    console.log(`Highlight box is in contact with the landmark ${limbLabel[circle.id]}`);
                                    const lastLimbUsed = limbLabel[circle.id] || "Unknown body part";
                                    document.getElementById('lastLimbUsed').innerText = lastLimbUsed;
                                }
                            }
                        }
                    });
                });
            });

            canvasCtx.restore();
        });

        const detections = await objectDetector.detectForVideo(video, startTimeMs);
        displayVideoDetections(detections);
    }

    window.requestAnimationFrame(predictWebcam);
}




var children = [];

function clearPreviousHighlights() {
    children.forEach(child => {
        if (child instanceof Node && child.parentNode) {
            child.parentNode.removeChild(child);
        }
    });
    children = [];
}

function createHighlightBox(detection) {
    const highlighter = document.createElement("div");
    highlighter.className = "highlighter";

    // Apply the scale factor to the bounding box dimensions and origins
    const scaledWidth = detection.boundingBox.width * scaleFactor;
    const scaledHeight = detection.boundingBox.height * scaleFactor;
    const scaledOriginX = detection.boundingBox.originX - (scaledWidth - detection.boundingBox.width) / 2;
    const scaledOriginY = detection.boundingBox.originY - (scaledHeight - detection.boundingBox.height) / 2;

    highlighter.style.left = `${canvasElement.offsetWidth - scaledWidth - scaledOriginX}px`;
    highlighter.style.top = `${scaledOriginY}px`;
    highlighter.style.width = `${scaledWidth}px`;
    highlighter.style.height = `${scaledHeight}px`;

    return highlighter;
}


function displayVideoDetections(result) {

    clearPreviousHighlights();

    for (let detection of result.detections) {

        const highlighter = createHighlightBox(detection, scaleFactor);
        liveView.appendChild(highlighter);
        children.push(highlighter);
    }
}

function isCollision(circle, highlightBox) {

    const boxCorners = [
        { x: highlightBox.x, y: highlightBox.y }, // top-left
        { x: highlightBox.x + highlightBox.width, y: highlightBox.y }, // top-right
        { x: highlightBox.x, y: highlightBox.y + highlightBox.height }, // bottom-left
        { x: highlightBox.x + highlightBox.width, y: highlightBox.y + highlightBox.height } // bottom-right
    ];

    // Check if the circle is entirely contained within the box
    if (circle.x + circle.radius < highlightBox.x + highlightBox.width &&
        circle.x - circle.radius > highlightBox.x &&
        circle.y + circle.radius < highlightBox.y + highlightBox.height &&
        circle.y - circle.radius > highlightBox.y) {
        return true;
    }

    // Check each corner of the box
    for (const corner of boxCorners) {
        const dx = circle.x - corner.x;
        const dy = circle.y - corner.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If the distance is less than the circle's radius, the circle and the box are colliding
        if (distance < circle.radius) {
            return true;
        }
    }

    return false;
}


// initialize the timer variables and start the animation
function startAnimating(fps) {
    fpsInterval = 1000 / fps;
    then = performance.now();
    startTime = then;
    animate();
}

// the animation loop calculates time elapsed since the last loop
// and only draws if your specified fps interval is achieved
function animate() {
    // request another frame
    requestAnimationFrame(animate);

    // calc elapsed time since last loop
    now = performance.now();
    elapsed = now - then;

    // if enough time has elapsed, draw the next frame
    if (elapsed > fpsInterval) {
        // Get ready for next frame by setting then=now. Also, adjust for fpsInterval not being multiple of 16.67
        then = now - (elapsed % fpsInterval);

        // Put your drawing code here
        frameCount++;
        if (now - startTime >= 1000) {
            document.getElementById('fps-number').innerText = frameCount;
            frameCount = 0;
            startTime = now;
        }
    }
}

startAnimating(60); // start animating with 60 fps target
