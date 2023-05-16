import { PoseLandmarker, ObjectDetector, FilesetResolver, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";
const demosSection = document.getElementById("demos");
let objectDetector;
let runningMode = "IMAGE";
let poseLandmarker = undefined;



// Initialize the object detector
const initializeObjectDetector = async () => {
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm");
    objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `efficientdet_lite2.tflite`,
            delegate: "GPU"
        },
        scoreThreshold: .005,
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
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        minPoseDetectionConfidence: 0.45,

    });
    demosSection.classList.remove("invisible");
};
createPoseLandmarker();





// DEMO PART2

const video = document.getElementById("webcam");
const liveView = document.getElementById("liveView");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const drawingUtils = new DrawingUtils(canvasCtx);



let flag_selected;





let enableWebcamButton;
const disableWebcamButton = document.getElementById('disableWebcamButton');

disableWebcamButton.addEventListener('click', () => {
    // Get the media stream from the video element
    const mediaStream = document.getElementById('webcam').srcObject;

    // Stop all tracks in the stream
    if (mediaStream) {
        const tracks = mediaStream.getTracks();
        tracks.forEach((track) => {
            track.stop();
        });
    }

    // // Remove all elements with the class "highlighter"
    // let highlightElements = document.getElementsByClassName('highlighter');
    // while (highlightElements[0]) {
    //     highlightElements[0].parentNode.removeChild(highlightElements[0]);
    // }

    // // Remove all p elements inside of liveView
    // let liveView = document.getElementById('liveView');
    // let pElements = liveView.getElementsByTagName('p');
    // while (pElements[0]) {
    //     pElements[0].parentNode.removeChild(pElements[0]);
    // }

    // Hide the disable button and show the enable button
    disableWebcamButton.style.display = 'none';
    webcamButton.style.display = 'block';
});




// Check if webcam access is supported.
function hasGetUserMedia() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}
// Keep a reference of all the child elements we create
// so we can remove them easilly on each render.
var children = [];
// If webcam supported, add event listener to button for when user
// wants to activate it.
if (hasGetUserMedia()) {
    enableWebcamButton = document.getElementById("webcamButton");
    enableWebcamButton.addEventListener("click", enableCam);

}
else {
    console.warn("getUserMedia() is not supported by your browser");
}
// Enable the live webcam view and start detection.
async function enableCam(event) {
    if (!objectDetector) {
        console.log("Wait! objectDetector not loaded yet.");
        return;
    }
    // Hide the button.
    enableWebcamButton.classList.add("removed");
    // getUsermedia parameters
    const constraints = {
        video: true
    };
    // Activate the webcam stream.
    navigator.mediaDevices
        .getUserMedia(constraints)
        .then(function (stream) {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
        })
        .catch((err) => {
            console.error(err);
            /* handle the error */
        });
    // Once the webcam is enabled, hide the enable button and show the disable button
    webcamButton.style.display = 'none';
    disableWebcamButton.style.display = 'block';
    let trackingPreference = document.querySelector('input[name="tracking"]:checked').value;
    flag_selected = trackingPreference;
}


const videoHeight = "540px";
const videoWidth = "720px";

let lastVideoTime = -1;

async function predictWebcam() {

    canvasElement.style.height = videoHeight;
    video.style.height = videoHeight;
    canvasElement.style.width = videoWidth;
    video.style.width = videoWidth;




    // if image mode is initialized, create a new classifier with video runningMode
    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await objectDetector.setOptions({ runningMode: "VIDEO" });
        await poseLandmarker.setOptions({ runningMode: "VIDEO" });
    }

    let startTimeMs = performance.now();


    // Detect objects using detectForVideo
    if (video.currentTime !== lastVideoTime) {
        if (flag_selected) {

            lastVideoTime = video.currentTime;
            poseLandmarker.detectForVideo(video, startTimeMs, (result) => {

                canvasCtx.save();
                canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

                for (const landmark of result.landmarks) {

                    let new_landmark = [landmark[12], landmark[11], landmark[26], landmark[28], landmark[30],
                    landmark[25], landmark[27], landmark[29], landmark[31]];


                    drawingUtils.drawLandmarks(new_landmark, {
                        radius: (data) => DrawingUtils.lerp(data.from.z, -20, 20, 150, 1)
                    });
                    // drawingUtils.drawConnectors(new_landmark, PoseLandmarker.POSE_CONNECTIONS);
                }
                canvasCtx.restore();
            });

            const detections = await objectDetector.detectForVideo(video, startTimeMs);
            displayVideoDetections(detections);
        }





        // Call this function again to keep predicting when the browser is ready
        window.requestAnimationFrame(predictWebcam);
    }
}



function displayVideoDetections(result) {
    // Remove any highlighting from previous frame.
    for (let child of children) {
        liveView.removeChild(child);
    }
    children.splice(0);

    // Scale factor to make the box larger
    const scaleFactor = 1;

    // Iterate through predictions and draw them to the live view
    for (let detection of result.detections) {
        const p = document.createElement("p");
        p.innerText =
            detection.categories[0].categoryName +
            " - with " +
            Math.round(parseFloat(detection.categories[0].score) * 100) +
            "% confidence.";

        // Apply the scale factor to the bounding box dimensions and origins
        const scaledWidth = detection.boundingBox.width * scaleFactor;
        const scaledHeight = detection.boundingBox.height * scaleFactor;
        const scaledOriginX = detection.boundingBox.originX - (scaledWidth - detection.boundingBox.width) / 2;
        const scaledOriginY = detection.boundingBox.originY - (scaledHeight - detection.boundingBox.height) / 2;

        p.style =
            "left: " +
            (canvasElement.offsetWidth - scaledWidth - scaledOriginX) +
            "px;" +
            "top: " +
            scaledOriginY +
            "px; " +
            "width: " +
            (scaledWidth) +
            "px;";

        const highlighter = document.createElement("div");
        highlighter.setAttribute("class", "highlighter");
        highlighter.style =
            "left: " +
            (canvasElement.offsetWidth - scaledWidth - scaledOriginX) +
            "px;" +
            "top: " +
            scaledOriginY +
            "px;" +
            "width: " +
            (scaledWidth) +
            "px;" +
            "height: " +
            scaledHeight +
            "px;";
        liveView.appendChild(highlighter);
        liveView.appendChild(p);
        // Store drawn objects in memory so they are queued to delete at next call
        children.push(highlighter);
        children.push(p);
    }
}



