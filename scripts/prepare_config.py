import json
import logging
import os

from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ROOT = "../media/pets"
GIF_TYPES = ["idle.gif", "walk.gif"]


def load_existing_config(path):
    if not os.path.isfile(path):
        return {}  # nothing to merge

    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error("Failed to load existing config %s: %s", path, e)
        return {}  # safe fallback


def get_pet_data(parent_folder, existing_data):
    data = existing_data.copy()  # start from previous data

    if 'pets' not in data:
        data['pets'] = {}

    for current_path, _dirs, files in os.walk(parent_folder):
        if not any(gif in files for gif in GIF_TYPES):
            continue

        rel_path = os.path.relpath(current_path, parent_folder).replace(os.sep, "/")

        # Ensure entry exists
        if rel_path not in data['pets']:
            data['pets'][rel_path] = {}

        for gif_name in GIF_TYPES:
            if gif_name not in files:
                continue

            fp = os.path.join(current_path, gif_name)

            try:
                with Image.open(fp) as img:
                    size = img.height
                    key = gif_name[:-4]  # "idle" or "walk"
                    # Preserve existing keys if any
                    if key not in data['pets'][rel_path]:
                        data['pets'][rel_path][key] = {}

                    data['pets'][rel_path][key]["size"] = size

            except Exception as e:
                logger.error("Error reading %s: %s", fp, e)

    return data


# MAIN
for item in os.listdir(ROOT):
    parent_path = os.path.join(ROOT, item)

    if not os.path.isdir(parent_path):
        continue

    logger.info("Processing parent folder: %s", item)

    json_path = os.path.join(parent_path, "config.json")

    # Load existing config if available
    existing_config = load_existing_config(json_path)

    # Merge new values
    result = get_pet_data(parent_path, existing_config)

    # Save merged config
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=4)
