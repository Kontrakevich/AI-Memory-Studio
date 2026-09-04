import unittest

from app.services.memory_models import PIPELINE_STAGES
from app.services.memory_prompts import character_card_prompt, identity_analysis_prompt
from app.services.model_registry import choose_video_model


class MemoryV3Tests(unittest.TestCase):
    def test_stage_order_has_identity_gates_before_video(self):
        self.assertLess(PIPELINE_STAGES.index("character_cards_qa"), PIPELINE_STAGES.index("video_generation"))
        self.assertLess(PIPELINE_STAGES.index("anchor_frames_qa"), PIPELINE_STAGES.index("video_generation"))
        self.assertLess(PIPELINE_STAGES.index("video_generation"), PIPELINE_STAGES.index("video_qa"))

    def test_identity_analyzer_forbids_invention_and_demographics(self):
        prompt = identity_analysis_prompt("EARLIER_SELF", ["child_01"])
        self.assertIn("Do not infer age, gender, sex, ethnicity", prompt)
        self.assertIn("Do not invent anatomy", prompt)
        self.assertIn("No source evidence = no mark", prompt)

    def test_character_card_is_one_sheet_and_headless(self):
        prompt = character_card_prompt(
            period_role="EARLIER_SELF",
            identity={"face_geometry": {}},
            cross_lock={},
            age_offset=0,
        )
        self.assertIn("ONE SINGLE COMPLETE", prompt)
        self.assertIn("HEADLESS FULL-LENGTH FRONT BODY", prompt)
        self.assertIn("No head, face, hair, ears, jaw", prompt)
        self.assertIn("Never invent moles", prompt)

    def test_video_router_requires_first_frame(self):
        registry = {
            "videos": [
                {
                    "id": "text-only-video",
                    "supported_durations": [8],
                    "supported_resolutions": ["720p"],
                    "supported_aspect_ratios": ["9:16"],
                    "supported_frame_images": [],
                },
                {
                    "id": "guided-video",
                    "supported_durations": [8],
                    "supported_resolutions": ["720p"],
                    "supported_aspect_ratios": ["9:16"],
                    "supported_frame_images": ["first_frame", "last_frame"],
                },
            ]
        }
        selected = choose_video_model(
            registry,
            requested=None,
            duration=8,
            resolution="720p",
            aspect_ratio="9:16",
            require_first_frame=True,
        )
        self.assertEqual(selected["id"], "guided-video")


if __name__ == "__main__":
    unittest.main()
