FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt pyproject.toml ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8001
EXPOSE 8001
# Replace this command with the service entrypoint during implementation.
CMD ["python", "-c", "raise SystemExit('Matching service scaffold: implement the application entrypoint before starting.')"]
