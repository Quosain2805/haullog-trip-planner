from datetime import datetime, timedelta

from rest_framework import serializers


class LocationField(serializers.Field):
    """Either a free-text string or {lat, lng, label}."""

    def to_internal_value(self, data):
        if isinstance(data, str):
            data = data.strip()
            if len(data) < 2:
                raise serializers.ValidationError("Enter a location.")
            return data
        if isinstance(data, dict):
            try:
                lat, lng = float(data["lat"]), float(data["lng"])
            except (KeyError, TypeError, ValueError):
                raise serializers.ValidationError("Location needs numeric lat and lng.")
            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                raise serializers.ValidationError("Coordinates out of range.")
            return {"lat": lat, "lng": lng, "label": str(data.get("label", ""))[:120]}
        raise serializers.ValidationError("Invalid location.")

    def to_representation(self, value):
        return value


class TripRequestSerializer(serializers.Serializer):
    current = LocationField()
    pickup = LocationField()
    dropoff = LocationField()
    cycle_used = serializers.FloatField(min_value=0, max_value=70)
    start_time = serializers.CharField(required=False, allow_blank=True)

    def validate_start_time(self, value):
        if not value:
            return None
        try:
            dt = datetime.fromisoformat(value.replace("Z", ""))
        except ValueError:
            raise serializers.ValidationError("Use ISO format, e.g. 2026-03-02T08:00.")
        dt = dt.replace(tzinfo=None, second=0, microsecond=0)
        # The log grid is in 15-minute steps, so snap the start to the nearest quarter hour.
        snapped = round(dt.minute / 15) * 15
        return dt.replace(minute=0) + timedelta(minutes=snapped)

    def validate(self, attrs):
        if not attrs.get("start_time"):
            attrs["start_time"] = datetime.now().replace(hour=8, minute=0, second=0, microsecond=0)
        return attrs
