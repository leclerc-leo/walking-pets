import os
import subprocess

from PIL import Image, ImageChops

ROOT_DIR = "../to_compress"
GIFSCILE_EXECUTABLE = r"C:\Users\leo\Downloads\gifsicle-1.95-win64\gifsicle.exe"


def trim_transparent(im):
    if im.mode in ("RGBA", "LA"):
        bg = Image.new(im.mode, im.size, (0, 0, 0, 0))
        diff = ImageChops.difference(im, bg)
        bbox = diff.getbbox()
        if bbox:
            return im.crop(bbox)
    return im


def snap_to_bottom_center(frames):
    max_w = max(frame.width for frame in frames)
    max_h = max(frame.height for frame in frames)

    aligned_frames = []

    for frame in frames:
        canvas = Image.new("RGBA", (max_w, max_h), (0, 0, 0, 0))

        x = (max_w - frame.width) // 2
        y = max_h - frame.height

        canvas.paste(frame, (x, y))
        aligned_frames.append(canvas)

    return aligned_frames


def process_gif(input_path, output_path):
    im = Image.open(input_path)

    frames = []
    durations = []

    for frame_index in range(im.n_frames):
        im.seek(frame_index)
        frame = im.convert("RGBA")

        frame = trim_transparent(frame)

        frames.append(frame)
        durations.append(im.info.get("duration", 40))

    aligned_frames = snap_to_bottom_center(frames)

    aligned_frames[0].save(
        output_path,
        save_all=True,
        append_images=aligned_frames[1:],
        duration=durations,
        loop=0,
        disposal=2,
        optimize=False,
    )


def optimize_gif(path_in, path_out):
    subprocess.run([
        GIFSCILE_EXECUTABLE,
        path_in,
        "--optimize=3",
        "--colors=256",
        "-o", path_out
    ], check=True)


for root, dirs, files in os.walk(ROOT_DIR):
    for file in files:
        if file.lower().endswith(".gif"):
            input_fp = os.path.join(root, file)

            outname = f"optimized_{file}"
            if file == "default_idle_8fps.gif":
                outname = "idle.gif"
            elif file == "default_walk_8fps.gif":
                outname = "walk.gif"
            output_fp = os.path.join(root, outname)

            process_gif(input_fp, output_fp)
            optimize_gif(output_fp, output_fp)
