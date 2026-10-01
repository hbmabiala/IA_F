// =========================================================================
// COMPOSANT : ASSISTANT CHAT RAG (BOUTON FLOTTANT, VOCAL & TEXTUEL)
// =========================================================================

// ==========================================
// ASSISTANT CHAT RAG (TEXTE & MICROPHONE)
// ==========================================
const ragChatInput = document.getElementById('rag-chat-input');
const ragChatSend = document.getElementById('rag-chat-send');
const ragChatHistory = document.getElementById('presentation-chat-history');
const ragMicBtn = document.getElementById('rag-mic-btn');
const ragAudioPlayer = document.getElementById('rag-audio-player');

if (ragChatSend && ragChatInput) {
    ragChatSend.onclick = () => sendRagChatMessage(null);
    ragChatInput.onkeypress = (e) => {
        if (e.key === 'Enter') sendRagChatMessage(null);
    };
}

let speechRecognitionInstance = null;
const isWebSpeechSupported = ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

if (ragMicBtn) {
    ragMicBtn.onclick = () => {
        if (isRagRecording) {
            stopRagVoiceRecording();
        } else {
            startRagVoiceRecording();
        }
    };
}

function startRagVoiceRecording() {
    pausePresentationForQuestion();
    if (isWebSpeechSupported) {
        try {
            const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
            speechRecognitionInstance = new SpeechRec();
            speechRecognitionInstance.lang = 'fr-FR';
            speechRecognitionInstance.continuous = false;
            speechRecognitionInstance.interimResults = false;
            
            isRagRecording = true;
            ragMicBtn.classList.add('mic-recording-pulse');
            
            speechRecognitionInstance.onresult = (event) => {
                const transcript = event.results[0][0].transcript.trim();
                stopRagVoiceRecording();
                if (transcript) {
                    sendRagChatMessage(null, transcript);
                }
            };
            
            speechRecognitionInstance.onerror = (event) => {
                console.warn("Web Speech error:", event.error);
                stopRagVoiceRecording();
                if (event.error === 'not-allowed') {
                    alert("Accès au microphone refusé.");
                }
            };
            
            speechRecognitionInstance.onend = () => {
                stopRagVoiceRecording();
            };
            
            speechRecognitionInstance.start();
            return;
        } catch (e) {
            console.warn("Web Speech init error, fallback MediaRecorder:", e);
        }
    }
    
    // Fallback MediaRecorder si Web Speech n'est pas supporté
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        presentationMediaRecorder = new MediaRecorder(stream);
        presentationMediaRecorder.start();
        isRagRecording = true;
        ragMicBtn.classList.add('mic-recording-pulse');
        presentationAudioChunks = [];
        
        presentationMediaRecorder.addEventListener('dataavailable', event => {
            presentationAudioChunks.push(event.data);
        });
        
        presentationMediaRecorder.addEventListener('stop', () => {
            const audioBlob = new Blob(presentationAudioChunks, { type: 'audio/webm' });
            sendRagChatMessage(audioBlob, null);
            stream.getTracks().forEach(track => track.stop());
        });
    }).catch(err => {
        alert("Erreur d'accès au microphone : " + err);
    });
}

function stopRagVoiceRecording() {
    if (speechRecognitionInstance && isRagRecording) {
        try { speechRecognitionInstance.stop(); } catch(e){}
    }
    if (presentationMediaRecorder && presentationMediaRecorder.state === 'recording') {
        presentationMediaRecorder.stop();
    }
    isRagRecording = false;
    ragMicBtn.classList.remove('mic-recording-pulse');
}

window.clearRagChatHistory = function() {
    if (ragChatHistory) {
        ragChatHistory.innerHTML = `
            <div class="chat-msg chat-msg-ai">
                Historique effacé. Posez votre question sur cette formation.
            </div>
        `;
    }
};

function sendRagChatMessage(audioBlob = null, directText = null) {
    if (!currentCourse) return;
    pausePresentationForQuestion();
    const text = directText || (ragChatInput ? ragChatInput.value.trim() : '');
    if (!text && !audioBlob) return;
    
    // Message utilisateur (question brute uniquement)
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-msg chat-msg-user';
    if (audioBlob) {
        userMsg.innerHTML = '<span style="opacity: 0.85; font-style: italic;">...</span>';
    } else {
        userMsg.textContent = text;
    }
    ragChatHistory.appendChild(userMsg);
    
    if (ragChatInput) ragChatInput.value = '';
    ragChatHistory.scrollTop = ragChatHistory.scrollHeight;
    
    // Bulle chargement
    const aiMsg = document.createElement('div');
    aiMsg.className = 'chat-msg chat-msg-ai';
    aiMsg.innerHTML = '<span style="opacity: 0.85; font-style: italic;">Recherche en cours...</span>';
    ragChatHistory.appendChild(aiMsg);
    ragChatHistory.scrollTop = ragChatHistory.scrollHeight;
    
    const formData = new FormData();
    formData.append('pdf_filename', currentCourse.pdf_url || currentCourse.base_filename || '');
    if (audioBlob) {
        formData.append('audio', audioBlob, 'question.webm');
    } else {
        formData.append('message', text);
    }
    
    fetch('/api/chat', {
        method: 'POST',
        body: formData
    })
    .then(async response => {
        let data;
        try {
            data = await response.json();
        } catch (jsonErr) {
            data = { error: `Erreur du serveur (${response.status})` };
        }
        
        if (!response.ok || data.error) {
            aiMsg.innerHTML = `<span style="color:red; font-weight:bold;">Erreur:</span> ${data.error || 'Une erreur est survenue.'}`;
            if (wasPresPausedForQuestion) {
                const resumeContainer = document.createElement('div');
                resumeContainer.style.marginTop = '10px';
                resumeContainer.innerHTML = `
                    <button onclick="resumePresentationAudio()" class="action-btn-sm" style="background: #000000; color: white; border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;" title="Reprendre l'explication de la présentation où elle s'était arrêtée">
                        Reprendre la présentation
                    </button>
                `;
                aiMsg.appendChild(resumeContainer);
            }
        } else {
            // Affichage direct du texte transcrit pour la question vocale
            if (data.transcription) {
                userMsg.textContent = data.transcription;
            }
            
            let formattedResponse = (data.response || '')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
                
            // Affichage direct et instantané de la réponse (< 0.5s)
            aiMsg.innerHTML = formattedResponse;
            if (wasPresPausedForQuestion) {
                const resumeContainer = document.createElement('div');
                resumeContainer.style.marginTop = '10px';
                resumeContainer.innerHTML = `
                    <button onclick="resumePresentationAudio()" class="action-btn-sm" style="background: #000000; color: white; border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;" title="Reprendre l'explication de la présentation où elle s'était arrêtée">
                        Reprendre la présentation
                    </button>
                `;
                aiMsg.appendChild(resumeContainer);
            }
            ragChatHistory.scrollTop = ragChatHistory.scrollHeight;
            
            // Génération et lecture audio en tâche de fond (asynchrone avec la même voix du cours)
            if (data.response) {
                const tutorVoice = currentCourse ? (currentCourse.edge_voice || currentCourse.tutor_voice) : null;
                fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        text: data.response,
                        course_id: currentCourse ? currentCourse.id : null,
                        voice: tutorVoice
                    })
                })
                .then(r => r.json())
                .then(ttsData => {
                    if (ttsData.audio_url && ragAudioPlayer) {
                        ragAudioPlayer.preservesPitch = true;
                        ragAudioPlayer.mozPreservesPitch = true;
                        ragAudioPlayer.webkitPreservesPitch = true;
                        ragAudioPlayer.playbackRate = currentPresentationSpeed;
                        ragAudioPlayer.src = ttsData.audio_url;
                        ragAudioPlayer.play().catch(e => console.log("Lecture audio RAG:", e));
                    }
                })
                .catch(e => console.log("TTS background error:", e));
            }
        }
        ragChatHistory.scrollTop = ragChatHistory.scrollHeight;
    })
    .catch(err => {
        aiMsg.innerHTML = `<span style='color:red;'>Erreur de communication avec le serveur: ${err.message || err}</span>`;
        if (wasPresPausedForQuestion) {
            const resumeContainer = document.createElement('div');
            resumeContainer.style.marginTop = '10px';
            resumeContainer.innerHTML = `
                <button onclick="resumePresentationAudio()" class="action-btn-sm" style="background: #000000; color: white; border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;" title="Reprendre l'explication de la présentation où elle s'était arrêtée">
                    Reprendre la présentation
                </button>
            `;
            aiMsg.appendChild(resumeContainer);
        }
        ragChatHistory.scrollTop = ragChatHistory.scrollHeight;
    });
}

