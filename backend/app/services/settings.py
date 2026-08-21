from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_host: str = "0.0.0.0"
    app_port: int = 8011
    app_title: str = "AI 1 September Memory Studio"
    data_root: str = "app/data"
    projects_root: str = "app/data/projects"

    # OpenRouter is available for Nano Banana / Gemini image editing and VLM analysis.
    openrouter_api_key: str = ""
    openrouter_image_model: str = "google/gemini-2.5-flash-image"
    openrouter_vision_model: str = "google/gemini-2.5-flash"

    # One Volcengine Ark key can power both Seedream and Seedance.
    ark_api_key: str = ""
    seedream_model: str = "doubao-seedream-4-0-250828"
    seedream_size: str = "2K"

    seedance_api_key: str = ""  # legacy alias; ARK_API_KEY is preferred
    seedance_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    seedance_model: str = "doubao-seedance-2-0-260128"
    seedance_ratio: str = "16:9"
    seedance_duration: int = 15
    seedance_resolution: str = "720p"
    seedance_generate_audio: bool = False

    # Optional fallback provider. Kling endpoint details vary by account/provider.
    kling_api_key: str = ""
    kling_base_url: str = ""
    kling_model: str = ""

    # Seedream is default for the end-to-end path because it can return public URLs
    # that Seedance accepts directly. Nano Banana/OpenRouter remains selectable.
    default_image_provider: str = "seedream"
    default_video_provider: str = "seedance"
    default_llm_provider: str = "openrouter"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def ark_key(self) -> str:
        return self.ark_api_key or self.seedance_api_key


settings = Settings()
