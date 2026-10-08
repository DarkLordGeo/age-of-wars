# Music

Expected soundtrack files (not included in the repository):

| Use | File | Track |
| --- | --- | --- |
| Age 1 gameplay | `glorious-morning.mp3` | "Glorious Morning" by Waterflame |

Only add a copy you have the rights to use (Waterflame licenses his music for games on request).
The game runs silently, and logs this path in the console, while a file is missing.
To change a track, edit `src/config/music.ts`. If an MP3 clicks or gaps at the loop point, set
`loopStart` / `loopEnd` there (encoder padding), or use an OGG/WAV/M4A file.
