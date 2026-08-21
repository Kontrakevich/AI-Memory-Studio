from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_host: str = "0.0.0.0"
    app_port: int = 8011
    app_title: str = "AI 1 September Memory Studio"
    data_root: str = "app/data"
    projects_root: str = "app/data/projects"
    openrouter_api_key: str = ""
    seedance_api_key: str = ""
    kling_api_key: str = ""
    nano_banana_api_key: str = ""
    default_image_provider: str = "nano_banana"
    default_video_provider: str = "seedance"
    default_llm_provider: str = "openrouter"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
