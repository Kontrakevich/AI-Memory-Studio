from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_host: str = "0.0.0.0"
    app_port: int = 8011
    app_title: str = "AI 1 September Memory Studio"
    data_root: str = "app/data"
    projects_root: str = "app/data/projects"

    # OpenRouter is the default image/LLM gateway used by the studio.
    openrouter_api_key: str = ""
    openrouter_image_model: str = "google/gemini-2.5-flash-image"
    openrouter_vision_model: str = "google/gemini-2.5-flash"

    # Official Volcengine Ark Seedance 2.0 API.
    seedance_api_key: str = ""
    seedance_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    seedance_model: str = "doubao-seedance-2-0-260128"
    seedance_ratio: str = "16:9"
    seedance_duration: int = 15
    seedance_resolution: str = "720p"
    seedance_generate_audio: bool = False

    # Optional fallback provider. Kept configurable because Kling API access varies by account/provider.
    kling_api_key: str = ""
    kling_base_url: str = ""
    kling_model: str = ""

    default_image_provider: str = "openrouter"
    default_video_provider: str = "seedance"
    default_llm_provider: str = "openrouter"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
