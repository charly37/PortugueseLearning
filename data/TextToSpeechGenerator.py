import os
from elevenlabs.client import ElevenLabs
from elevenlabs import VoiceSettings


client = ElevenLabs(
    api_key=os.environ.get('TEXT_TO_SPEECH_API_KEY')
)

aword = "apenas"

audio = client.text_to_speech.convert(
    text=aword,
    voice_id="aLFUti4k8YKvtQGXv0UO", #Pt EU acccent    
    language_code="pt", #PT (the fact that we want EU accent is in the voice_id)
    model_id="eleven_flash_v2_5",
    output_format="mp3_44100_128",
    #output_format="opus_48000_128",
    voice_settings=VoiceSettings(
        speed=0.85,
        # You can also include other voice settings here if needed,
        # such as stability, similarity_boost, style, or use_speaker_boost.
    ),
)

# Save audio to file
output_file = f"{aword}.mp3"
with open(output_file, "wb") as f:
    for chunk in audio:
        f.write(chunk)

print(f"Audio saved to {output_file}")