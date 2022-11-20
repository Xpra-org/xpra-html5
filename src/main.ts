export * from "./app/client";



window.addEventListener("load", () => {
    // Register ServiceWorker.
    navigator.serviceWorker
        ?.register("service-worker.js")
        .then((registration) => {
            console.log("Service Worker registered: ", registration);
        })
        .catch((registrationError) => {
            console.error("Service Worker registration failed: ", registrationError);
        });
});