import { useCallback } from 'react';

export function useAudio(soundEnabled: boolean) {
    // Function to play a specific sound file once
    const playSound = useCallback((soundFile: string, volume: number = 0.5) => {
        if (!soundEnabled) return;

        const sound = new Audio(soundFile);
        sound.volume = volume;
        sound.play().catch(error => {
            console.warn(`Audio playback failed for ${soundFile}:`, error);
        });
    }, [soundEnabled]);

    // Function to play the meow sound when opening a position
    const playMeow = useCallback(() => {
        playSound('/assets/sounds/meow.mp3', 0.8);
    }, [playSound]);

    // Function to play the begging meow sound halfway through the countdown
    const playBeggingMeow = useCallback(() => {
        playSound('/assets/sounds/begging-meow.wav', 0.3);
    }, [playSound]);

    // Function to play the win sound when game completes with a win
    const playWinSound = useCallback(() => {
        playSound('/assets/sounds/sweet-meow.wav', 0.6);
    }, [playSound]);

    // Function to play the loss sound when game completes with a loss
    const playLossSound = useCallback(() => {
        playSound('/assets/sounds/ouch-meow.wav', 0.6);
    }, [playSound]);

    return { playMeow, playBeggingMeow, playWinSound, playLossSound }; // Return the functions to play sound effects
}
