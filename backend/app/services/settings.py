from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_host: str = "0.0.0.0"
    app_port: int = 8011
    app_title: str = "AI Memory Studio"
    data_root: str = "app/data"
    projects_root: str = "app/data/projects"
    public_base_url: str = ""

    # OpenRouter-first V3 stack: one key for vision, image and video generation.
    openrouter_api_key: str = ""
    openrouter_vision_model: str = "google/gemini-2.5-flash"
    openrouter_video_qa_model: str = "openrouter/auto-beta"
    openrouter_image_model: str = "google/gemini-2.5-flash-image"
    openrouter_video_model: str = ""
    openrouter_generation_timeout: int = 900
    model_registry_ttl_minutes: int = 60

    # V3 generation defaults. Model capabilities are validated dynamically against
    # OpenRouter model catalogs before each expensive generation request.
    memory_aspect_ratio: str = "9:16"
    memory_video_duration: int = 8
    memory_video_resolution: str = "720p"
    memory_generate_audio: bool = False
    pipeline_max_retries: int = 2
    source_max_photos_per_period: int = 2

    # Optional legacy providers are preserved for backwards compatibility with old
    # project utilities, but V3 does not depend on them.
    ark_api_key: str = ""
    seedream_model: str = "doubao-seedream-4-0-250828"
    seedream_size: str = "2K"
    seedance_api_key: str = ""
    seedance_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    seedance_model: str = "doubao-seedance-2-0-260128"
    seedance_ratio: str = "16:9"
    seedance_duration: int = 15
    seedance_resolution: str = "720p"
    seedance_generate_audio: bool = False
    kling_api_key: str = ""
    kling_base_url: str = ""
    kling_model: str = ""

    default_image_provider: str = "openrouter"
    default_video_provider: str = "openrouter"
    default_llm_provider: str = "openrouter"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def ark_key(self) -> str:
        return self.ark_api_key or self.seedance_api_key


settings = Settings()
