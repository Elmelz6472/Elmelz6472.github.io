import {
    PoseLandmarker,
    ObjectDetector,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";
const demosSection = document.getElementById("demos");
const video = document.getElementById("webcam");
const liveView = document.getElementById("liveView");
const canvasElement = document.getElementById("output_canvas");
const disableWebcamButton = document.getElementById('disableWebcamButton');
const canvasCtx = canvasElement.getContext("2d");
const drawingUtils = new DrawingUtils(canvasCtx);
let scaleFactor = 1;
let videoHeight = "540px";
let videoWidth = "720px"
let originalVideoWidth = 720; // initial video width
let originalVideoHeight = 540; // initial video heigh;



let isCameraBeenOpened = false;
let lastVideoTime = -1;
let enableWebcamButton;
let flag_selected;
let ballFlag;
let gameMode;
let runningMode = "IMAGE";
let currentLimb = null;
let objectDetector = undefined;
let poseLandmarker = undefined;
let collisionCount = 0;
let collisionDelay = 500; // Delay in ms
let lastCollisionTime = 0;


let frameCount = 0;
let fpsInterval, startTime, now, then, elapsed;

var children = [];

const sequenceAppToFollow = ["LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_SHOULDER", "LEFT_SHOULDER", "RIGHT_SHOULDER"];
const sequenceAppToCreate = [];

const limbLabel = {
    0: "LEFT_SHOULDER",
    1: "RIGHT_SHOULDER",
    2: "LEFT_KNEE",
    3: "LEFT_FOOT",
    4: "RIGHT_KNEE",
    5: "RIGHT_FOOT",
}




// Initialize the object detector
const initializeObjectDetector = async () => {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
    objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
            // modelAssetPath: `efficientdet_lite2.tflite`,
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,

            delegate: "GPU"
        },
        scoreThreshold: .03,
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
        minPosePresenceConfidence: 0.75,
        minTrackingConfidence: 0.75,
        minPoseDetectionConfidence: 0.75,
    });
    demosSection.classList.remove("invisible");
};
createPoseLandmarker();


disableWebcamButton.addEventListener('click', () => {
    // Stop the video feed
    const mediaStream = document.getElementById('webcam').srcObject;
    if (mediaStream) {
        const tracks = mediaStream.getTracks();
        tracks.forEach((track) => {
            track.stop();
        });
    }

    // Reset text elements
    document.getElementById('lastLimbUsed').innerText = "Last limb used: None";
    document.getElementById('collisionCounter').innerText = "Collisions: 0";


    // Clear the canvas
    const canvas = document.getElementById('output_canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Hide disable webcam button and show enable webcam button
    disableWebcamButton.style.display = 'none';
    webcamButton.style.display = 'block';

    // Set the camera open state to false
    isCameraBeenOpened = false;
    collisionCount = 0;
    currentLimb = null;
});

function hasGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

if (hasGetUserMedia()) {
    enableWebcamButton = document.getElementById("webcamButton");
    enableWebcamButton.addEventListener("click", enableCam);
} else {
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
    const trackingPreference = document.querySelector('input[name="modeTracking"]:checked').value;
    return trackingPreference;
}

function getTrackingBallPreference() {
    const trackingBallPreference = document.querySelector('input[name="modeTrackingBall"]:checked').value;
    return trackingBallPreference;
}

function getModeSelected() {
    const modeSelected = document.querySelector('input[name="mode"]:checked').value;
    return modeSelected;
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
    ballFlag = getTrackingBallPreference();
    gameMode = getModeSelected();
    isCameraBeenOpened = true;
}

function processLandmarks(landmarks) {
    // return [landmarks[12], landmarks[11], landmarks[26], landmarks[28], landmarks[30], landmarks[25], landmarks[27], landmarks[29], landmarks[31]];
    return [landmarks[12], landmarks[11], landmarks[26], landmarks[30], landmarks[25], landmarks[31]];

}


function isPrefix(arr1, arr2) {
    if (arr2.length > arr1.length) {
        return false;
    }
    for (let i = 0; i < arr2.length; i++) {
        if (arr2[i] !== arr1[i]) {
            return false;
        }
    }
    return true;
}


async function setRunningMode() {
    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await objectDetector.setOptions({
            runningMode: "VIDEO"
        });
        await poseLandmarker.setOptions({
            runningMode: "VIDEO"
        });
    }
}

async function predictWebcam() {
    canvasElement.style.height = videoHeight;
    canvasElement.style.width = videoWidth;
    video.style.height = videoHeight;
    video.style.width = videoWidth;

    await setRunningMode();
    let startTimeMs = performance.now();

    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;

        poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
            canvasCtx.save();
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;

            result.landmarks.forEach(landmark => {
                let new_landmark = processLandmarks(landmark);
                let new_radius = (data) => DrawingUtils.lerp(data.from.z, -20, 20, 150, 1)
                if (flag_selected == "Tracking") {
                    drawingUtils.drawLandmarks(new_landmark, {
                        radius: new_radius
                    });
                }


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
                                    document.getElementById("collisionCounter").textContent = `Collisions: ${collisionCount}`;
                                    const lastLimbUsed = limbLabel[circle.id] || "Unknown body part";
                                    document.getElementById('lastLimbUsed').innerText = lastLimbUsed; //4_>right_knee, 2->left_knee, 5->right_foot, 3->lrft_foot
                                    if (gameMode == "basic") {
                                        if (currentLimb == lastLimbUsed) {
                                            generateExit();
                                        }
                                    }
                                    if (gameMode == "advanced") {
                                        sequenceAppToCreate.push(limbLabel[circle.id]);
                                        if (!isPrefix(sequenceAppToCreate, sequenceAppToFollow)) {
                                            generateExit("wrong pattern");
                                        }


                                    }
                                    currentLimb = lastLimbUsed;
                                }
                            }
                        }
                    });
                });
            });

            canvasCtx.restore();
        });

        const detections = await objectDetector.detectForVideo(video, startTimeMs);
        if (ballFlag == "Tracking") {
            displayVideoDetections(detections);
        }
    }

    window.requestAnimationFrame(predictWebcam);
}


function generateExit(custom_message = null) {
    document.getElementById("disableWebcamButton").click();
    if (custom_message)
        alert(custom_message)
    else
        alert("You failed the challenge");
    return;
}

function generateReset() {
    document.getElementById("disableWebcamButton").click();
}

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

    let scaledWidth = detection.boundingBox.width * scaleFactor;
    let scaledHeight = detection.boundingBox.height * scaleFactor;
    let scaledOriginX = detection.boundingBox.originX * scaleFactor;
    let scaledOriginY = detection.boundingBox.originY * scaleFactor;

    if (document.fullscreenElement) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Adjust for aspect ratio
        const videoAspectRatio = originalVideoWidth / originalVideoHeight;
        const viewportAspectRatio = viewportWidth / viewportHeight;

        if (videoAspectRatio > viewportAspectRatio) {
            // Video has a wider aspect ratio than the viewport, adjust height
            const adjustedHeight = viewportWidth / videoAspectRatio;
            const heightOffset = (viewportHeight - adjustedHeight) / 2;

            scaledOriginY = (scaledOriginY / originalVideoHeight) * adjustedHeight + heightOffset;
            scaledHeight = (scaledHeight / originalVideoHeight) * adjustedHeight;
        } else {
            // Viewport has a wider aspect ratio than the video, adjust width
            const adjustedWidth = viewportHeight * videoAspectRatio;
            const widthOffset = (viewportWidth - adjustedWidth) / 2;

            scaledOriginX = (scaledOriginX / originalVideoWidth) * adjustedWidth + widthOffset;
            scaledWidth = (scaledWidth / originalVideoWidth) * adjustedWidth;
        }

        // Invert the x-axis when in fullscreen mode
        const invertedOriginX = viewportWidth - (scaledOriginX + scaledWidth);

        // Convert pixel values to percentages
        const leftPercentage = (invertedOriginX / viewportWidth) * 100;
        const topPercentage = (scaledOriginY / viewportHeight) * 100;
        const widthPercentage = (scaledWidth / viewportWidth) * 100;
        const heightPercentage = (scaledHeight / viewportHeight) * 100;

        highlighter.style.left = `${leftPercentage}%`;
        highlighter.style.top = `${topPercentage}%`;
        highlighter.style.width = `${widthPercentage}%`;
        highlighter.style.height = `${heightPercentage}%`;
    } else {
        highlighter.style.left = `${canvasElement.offsetWidth - scaledWidth - scaledOriginX}px`;
        highlighter.style.top = `${scaledOriginY}px`;
        highlighter.style.width = `${scaledWidth}px`;
        highlighter.style.height = `${scaledHeight}px`;
    }

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



function toggleFullscreen() {
    const fullscreenElement =
        document.fullscreenElement || document.webkitFullscreenElement;
    const container = document.getElementById('liveView');

    if (fullscreenElement) {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) { // Firefox
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) { // Chrome, Safari and Opera
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { // IE/Edge
            document.msExitFullscreen();
        }
    } else {
        if (container.requestFullscreen) {
            container.requestFullscreen();
        } else if (container.mozRequestFullScreen) { // Firefox
            container.mozRequestFullScreen();
        } else if (container.webkitRequestFullscreen) { // Chrome, Safari and Opera
            container.webkitRequestFullscreen();
        } else if (container.msRequestFullscreen) { // IE/Edge
            container.msRequestFullscreen();
        }
    }
}

window.toggleFullscreen = toggleFullscreen;


// Handle fullscreen change event for all browsers
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

function handleFullscreenChange() {
    const fullscreenElement =
        document.fullscreenElement || document.webkitFullscreenElement;
    const video = document.getElementById('webcam');
    const canvasElement = document.getElementById('output_canvas');

    if (fullscreenElement) {
        // set the video and canvas dimensions to fill the screen
        video.style.height = '100vh';
        video.style.width = '100vw';
        canvasElement.style.height = '100vh';
        canvasElement.style.width = '100vw';

        // update the videoWidth and videoHeight variables
        videoWidth = video.clientWidth;
        videoHeight = video.clientHeight;
    } else {
        // set the video and canvas dimensions back to original when exiting fullscreen
        video.style.height = '540px';
        video.style.width = '720px';
        canvasElement.style.height = '540px';
        canvasElement.style.width = '720px';

        // update the videoWidth and videoHeight variables
        videoWidth = 720; // original video width
        videoHeight = 540; // original video height
    }

    // Update scaleFactor whenever the video dimensions change
    scaleFactor = Math.min(videoWidth / originalVideoWidth, videoHeight / originalVideoHeight);
}



function isCollision(circle, highlightBox) {

    const boxCorners = [{
        x: highlightBox.x,
        y: highlightBox.y
    }, // top-left
    {
        x: highlightBox.x + highlightBox.width,
        y: highlightBox.y
    }, // top-right
    {
        x: highlightBox.x,
        y: highlightBox.y + highlightBox.height
    }, // bottom-left
    {
        x: highlightBox.x + highlightBox.width,
        y: highlightBox.y + highlightBox.height
    } // bottom-right
    ];

    // Check if the circle is entirely contained within the box
    if ((circle.x + circle.radius < highlightBox.x + highlightBox.width)) {
        if (circle.x - circle.radius > highlightBox.x) {
            if (circle.y + circle.radius < highlightBox.y + highlightBox.height) {
                if (circle.y - circle.radius > highlightBox.y) {
                    return true;
                }
            }
        }
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


function startAnimating(fps) {
    fpsInterval = 1000 / fps;
    then = performance.now();
    startTime = then;
    animate();
}

function animate() {

    requestAnimationFrame(animate);
    now = performance.now();
    elapsed = now - then;

    if (elapsed > fpsInterval) {
        then = now - (elapsed % fpsInterval);

        frameCount++;
        if (now - startTime >= 1000) {
            if (isCameraBeenOpened) {
                document.getElementById('fps-number').innerText = frameCount;
            } else {
                document.getElementById('fps-number').innerText = 0;
            }
            frameCount = 0;
            startTime = now;
        }
    }
}

startAnimating(60);


